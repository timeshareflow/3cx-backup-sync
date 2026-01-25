import * as path from "path";
import { Pool } from "pg";
import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import {
  uploadBuffer,
  generateStoragePath,
  fileExists,
  detectFileType,
} from "../storage/supabase-storage";
import { createSftpClient, downloadFile, closeSftpClient } from "../storage/sftp";
import { insertCallRecording, updateSyncStatus, getLastSyncedTimestamp } from "../storage/supabase";
import { TenantConfig, getTenantSftpConfig } from "../tenant";
import { getRecordings } from "../threecx/queries";

export interface RecordingsSyncResult {
  filesSynced: number;
  filesSkipped: number;
  errors: Array<{ recordingId: string; error: string }>;
}

// Default recordings base path on 3CX servers
const DEFAULT_RECORDINGS_BASE = "/var/lib/3cxpbx/Instance1/Data/Recordings";

// Convert a recording URL to a filesystem path for SFTP download
function urlToFilesystemPath(recordingUrl: string, basePath: string): string {
  // Remove URL scheme if present
  let urlPath = recordingUrl;
  if (urlPath.startsWith("http://") || urlPath.startsWith("https://")) {
    try {
      const url = new URL(urlPath);
      urlPath = url.pathname;
    } catch {
      // If parsing fails, just use as-is
    }
  }

  // If it's already an absolute path starting with basePath, use it
  if (urlPath.startsWith(basePath)) {
    return urlPath;
  }

  // If it starts with a slash, it might be a relative URL path like /100/recording.wav
  if (urlPath.startsWith("/")) {
    // Try to construct the full path
    // URL patterns like /100/Recordings/file.wav -> basePath/100/file.wav
    // Or /recordings/100/file.wav -> basePath/100/file.wav
    const parts = urlPath.split("/").filter(Boolean);

    // Look for extension number pattern (3-4 digit number)
    const extIndex = parts.findIndex(p => /^\d{3,4}$/.test(p));
    if (extIndex !== -1) {
      // Get the extension number and everything after it
      const relevantParts = parts.slice(extIndex);
      return path.posix.join(basePath, ...relevantParts);
    }

    // If we can't find an extension pattern, just append the filename to base
    const filename = parts[parts.length - 1];
    return path.posix.join(basePath, filename);
  }

  // Otherwise append the path to base
  return path.posix.join(basePath, urlPath);
}

export async function syncRecordings(
  tenant: TenantConfig,
  pool: Pool
): Promise<RecordingsSyncResult> {
  const result: RecordingsSyncResult = {
    filesSynced: 0,
    filesSkipped: 0,
    errors: [],
  };

  if (!tenant.backup_recordings) {
    logger.info("Recording backup disabled for tenant", { tenantId: tenant.id });
    return result;
  }

  // Get SFTP config for downloading recordings
  const sftpConfig = getTenantSftpConfig(tenant);
  if (!sftpConfig) {
    logger.info("No SFTP credentials configured - skipping recordings sync", { tenantId: tenant.id });
    return result;
  }

  const recordingsBasePath = tenant.threecx_recordings_path || DEFAULT_RECORDINGS_BASE;

  let sftp;
  try {
    await updateSyncStatus("recordings", "running", { tenantId: tenant.id });

    // Get last sync timestamp to only fetch new records
    const lastSync = await getLastSyncedTimestamp("recordings", tenant.id);
    const since = lastSync ? new Date(lastSync) : null;

    logger.info("Fetching recordings from 3CX database", {
      tenantId: tenant.id,
      since: since?.toISOString() || "beginning",
    });

    // Fetch recordings from 3CX database
    const recordings = await getRecordings(since, 500, pool);

    if (recordings.length === 0) {
      const notes = since ? "No new recordings since last sync" : "No recordings found in 3CX database";
      logger.info("No new recordings to sync", { tenantId: tenant.id });
      await updateSyncStatus("recordings", "success", { recordsSynced: 0, notes, tenantId: tenant.id });
      return result;
    }

    logger.info(`Processing ${recordings.length} recordings`, { tenantId: tenant.id });

    // Connect to SFTP
    logger.info("Connecting to 3CX server via SFTP for recordings", {
      tenantId: tenant.id,
      host: sftpConfig.host,
    });
    sftp = await createSftpClient(sftpConfig);

    for (const recording of recordings) {
      try {
        if (!recording.recording_url) {
          logger.debug("Recording has no URL, skipping", { recordingId: recording.recording_id });
          result.filesSkipped++;
          continue;
        }

        // Convert URL to filesystem path
        const remotePath = urlToFilesystemPath(recording.recording_url, recordingsBasePath);
        const filename = path.posix.basename(remotePath) || `recording_${recording.recording_id}.wav`;

        // Generate storage path
        const storagePath = generateStoragePath(tenant.id, "recordings", filename);

        // Check if already uploaded
        const exists = await fileExists(storagePath);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        // Download the recording via SFTP
        logger.debug("Downloading recording via SFTP", {
          tenantId: tenant.id,
          recordingId: recording.recording_id,
          remotePath,
        });

        let buffer: Buffer;
        try {
          buffer = await downloadFile(sftp, remotePath);
        } catch (downloadError) {
          // Try alternate path patterns if the first one fails
          const altPaths = [
            // Try with Recordings subfolder
            path.posix.join(recordingsBasePath, recording.extension_number || "", "Recordings", filename),
            // Try directly under extension
            path.posix.join(recordingsBasePath, recording.extension_number || "", filename),
            // Try just the filename in base path
            path.posix.join(recordingsBasePath, filename),
          ];

          let downloaded = false;
          for (const altPath of altPaths) {
            if (altPath === remotePath) continue; // Skip if same as original
            try {
              logger.debug("Trying alternate path", { altPath });
              buffer = await downloadFile(sftp, altPath);
              downloaded = true;
              break;
            } catch {
              // Continue to next path
            }
          }

          if (!downloaded) {
            result.errors.push({
              recordingId: recording.recording_id,
              error: `Failed to download: file not found at ${remotePath}`,
            });
            continue;
          }
        }

        // Detect content type
        const { mimeType } = detectFileType(buffer!);

        // Upload to Supabase Storage
        const uploadResult = await uploadBuffer(buffer!, storagePath, mimeType);

        // Calculate duration
        const durationSeconds = recording.duration_seconds ||
          (recording.start_time && recording.end_time
            ? Math.floor((new Date(recording.end_time).getTime() - new Date(recording.start_time).getTime()) / 1000)
            : null);

        // Record in database
        await insertCallRecording({
          tenant_id: tenant.id,
          threecx_recording_id: recording.recording_id,
          extension: recording.extension_number || undefined,
          caller_number: recording.caller_number || undefined,
          callee_number: recording.callee_number || undefined,
          original_filename: filename,
          file_size: uploadResult.size,
          storage_path: uploadResult.path,
          mime_type: mimeType,
          duration_seconds: durationSeconds || undefined,
          transcription: recording.transcription || undefined,
          recorded_at: recording.start_time?.toISOString() || new Date().toISOString(),
          call_started_at: recording.start_time?.toISOString(),
          call_ended_at: recording.end_time?.toISOString(),
        });

        result.filesSynced++;
        logger.debug(`Synced recording via SFTP`, { tenantId: tenant.id, recordingId: recording.recording_id });
      } catch (error) {
        const err = handleError(error);
        // Skip duplicates silently
        if (err.message.includes("duplicate") || err.message.includes("23505")) {
          result.filesSkipped++;
          continue;
        }
        result.errors.push({
          recordingId: recording.recording_id,
          error: err.message,
        });
        logger.error("Failed to sync recording", {
          tenantId: tenant.id,
          recordingId: recording.recording_id,
          error: err.message,
        });
      }
    }

    // Build notes with summary
    let notes = `Synced ${result.filesSynced}, skipped ${result.filesSkipped}`;
    if (result.errors.length > 0) {
      notes += `, ${result.errors.length} failed`;
    }

    await updateSyncStatus("recordings", "success", {
      recordsSynced: result.filesSynced,
      notes,
      tenantId: tenant.id,
    });

    logger.info("Recordings sync completed", {
      tenantId: tenant.id,
      synced: result.filesSynced,
      skipped: result.filesSkipped,
      errors: result.errors.length,
    });

    return result;
  } catch (error) {
    const err = handleError(error);
    logger.error("Recordings sync failed", { tenantId: tenant.id, error: err.message });
    await updateSyncStatus("recordings", "error", {
      errorMessage: err.message,
      tenantId: tenant.id,
    });
    throw err;
  } finally {
    if (sftp) {
      await closeSftpClient(sftp);
    }
  }
}
