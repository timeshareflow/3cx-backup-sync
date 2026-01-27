/**
 * Local Recordings Sync - Reads directly from filesystem (no SFTP)
 * Used when sync agent runs on the 3CX server itself.
 */

import * as fs from "fs";
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
import { insertCallRecording, updateSyncStatus, getLastSyncedTimestamp } from "../storage/supabase";
import { getRecordings } from "../threecx/queries";

interface LocalTenantConfig {
  id: string;
  threecx_recordings_path: string | null;
  backup_recordings: boolean;
}

export interface RecordingsSyncResult {
  filesSynced: number;
  filesSkipped: number;
  errors: Array<{ recordingId: string; error: string }>;
}

// Default recordings base path on 3CX servers
const DEFAULT_RECORDINGS_BASE = "/var/lib/3cxpbx/Instance1/Data/Recordings";

// Convert a recording URL to a local filesystem path
function urlToFilesystemPath(recordingUrl: string, basePath: string): string {
  let urlPath = recordingUrl;

  // Remove URL scheme if present
  if (urlPath.startsWith("http://") || urlPath.startsWith("https://")) {
    try {
      const url = new URL(urlPath);
      urlPath = url.pathname;
    } catch {
      // If parsing fails, use as-is
    }
  }

  // If it's already an absolute path starting with basePath, use it
  if (urlPath.startsWith(basePath)) {
    return urlPath;
  }

  // If it starts with a slash, try to construct the full path
  if (urlPath.startsWith("/")) {
    const parts = urlPath.split("/").filter(Boolean);

    // Look for extension number pattern (3-4 digit number)
    const extIndex = parts.findIndex((p) => /^\d{3,4}$/.test(p));
    if (extIndex !== -1) {
      const relevantParts = parts.slice(extIndex);
      return path.posix.join(basePath, ...relevantParts);
    }

    // Just append the filename to base
    const filename = parts[parts.length - 1];
    return path.posix.join(basePath, filename);
  }

  return path.posix.join(basePath, urlPath);
}

// Read file from local filesystem
async function readLocalFile(filePath: string): Promise<Buffer> {
  return fs.promises.readFile(filePath);
}

export async function syncRecordingsLocal(
  tenant: LocalTenantConfig,
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

  const recordingsBasePath = tenant.threecx_recordings_path || DEFAULT_RECORDINGS_BASE;

  // Check if path exists
  if (!fs.existsSync(recordingsBasePath)) {
    logger.warn("Recordings path does not exist", {
      tenantId: tenant.id,
      path: recordingsBasePath,
    });
    return result;
  }

  try {
    await updateSyncStatus("recordings", "running", { tenantId: tenant.id });

    // Get last sync timestamp
    const lastSync = await getLastSyncedTimestamp("recordings", tenant.id);
    const since = lastSync ? new Date(lastSync) : null;

    logger.info("Fetching recordings from 3CX database", {
      tenantId: tenant.id,
      since: since?.toISOString() || "beginning",
    });

    // Fetch recordings from 3CX database
    const recordings = await getRecordings(since, 500, pool);

    if (recordings.length === 0) {
      const notes = since
        ? "No new recordings since last sync"
        : "No recordings found in 3CX database";
      logger.info("No new recordings to sync", { tenantId: tenant.id });
      await updateSyncStatus("recordings", "success", {
        recordsSynced: 0,
        notes,
        tenantId: tenant.id,
      });
      return result;
    }

    logger.info(`Processing ${recordings.length} recordings`, { tenantId: tenant.id });

    for (const recording of recordings) {
      try {
        if (!recording.recording_url) {
          logger.debug("Recording has no URL, skipping", {
            recordingId: recording.recording_id,
          });
          result.filesSkipped++;
          continue;
        }

        // Convert URL to local path
        const localPath = urlToFilesystemPath(recording.recording_url, recordingsBasePath);
        const filename =
          path.posix.basename(localPath) || `recording_${recording.recording_id}.wav`;

        // Generate storage path
        const storagePath = generateStoragePath(tenant.id, "recordings", filename);

        // Check if already uploaded
        const exists = await fileExists(storagePath);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        // Check if file exists locally
        if (!fs.existsSync(localPath)) {
          // Try alternate paths
          const altPaths = [
            path.posix.join(
              recordingsBasePath,
              recording.extension_number || "",
              "Recordings",
              filename
            ),
            path.posix.join(recordingsBasePath, recording.extension_number || "", filename),
            path.posix.join(recordingsBasePath, filename),
          ];

          let foundPath: string | null = null;
          for (const altPath of altPaths) {
            if (fs.existsSync(altPath)) {
              foundPath = altPath;
              break;
            }
          }

          if (!foundPath) {
            result.errors.push({
              recordingId: recording.recording_id,
              error: `File not found: ${localPath}`,
            });
            continue;
          }
        }

        // Read file from local filesystem
        const buffer = await readLocalFile(localPath);

        // Detect content type
        const { mimeType } = detectFileType(buffer);

        // Upload to Supabase Storage
        const uploadResult = await uploadBuffer(buffer, storagePath, mimeType);

        // Calculate duration
        const durationSeconds =
          recording.duration_seconds ||
          (recording.start_time && recording.end_time
            ? Math.floor(
                (new Date(recording.end_time).getTime() -
                  new Date(recording.start_time).getTime()) /
                  1000
              )
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
        logger.debug("Synced recording from local filesystem", {
          tenantId: tenant.id,
          recordingId: recording.recording_id,
        });
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

    // Build notes
    let notes = `Synced ${result.filesSynced}, skipped ${result.filesSkipped}`;
    if (result.errors.length > 0) {
      notes += `, ${result.errors.length} failed`;
    }

    await updateSyncStatus("recordings", "success", {
      recordsSynced: result.filesSynced,
      notes,
      tenantId: tenant.id,
    });

    logger.info("Local recordings sync completed", {
      tenantId: tenant.id,
      synced: result.filesSynced,
      skipped: result.filesSkipped,
      errors: result.errors.length,
    });

    return result;
  } catch (error) {
    const err = handleError(error);
    logger.error("Local recordings sync failed", {
      tenantId: tenant.id,
      error: err.message,
    });
    await updateSyncStatus("recordings", "error", {
      errorMessage: err.message,
      tenantId: tenant.id,
    });
    throw err;
  }
}
