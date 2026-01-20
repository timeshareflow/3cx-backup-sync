import { Pool } from "pg";
import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import {
  uploadBuffer,
  generateStoragePath,
  fileExists,
} from "../storage/supabase-storage";
import { insertCallRecording, updateSyncStatus, getLastSyncedTimestamp } from "../storage/supabase";
import { TenantConfig } from "../tenant";
import { getRecordings } from "../threecx/queries";

export interface RecordingsSyncResult {
  filesSynced: number;
  filesSkipped: number;
  errors: Array<{ recordingId: string; error: string }>;
}

// Download a recording file from 3CX
async function downloadRecording(
  recordingUrl: string,
  threecxHost: string
): Promise<{ buffer: Buffer; contentType: string; filename: string } | null> {
  try {
    // Build full URL - recording_url may be relative or absolute
    let fullUrl: string;
    if (recordingUrl.startsWith("http://") || recordingUrl.startsWith("https://")) {
      fullUrl = recordingUrl;
    } else {
      // Remove leading slash if present and build URL
      const cleanPath = recordingUrl.startsWith("/") ? recordingUrl.slice(1) : recordingUrl;
      fullUrl = `https://${threecxHost}/${cleanPath}`;
    }

    logger.debug("Downloading recording", { url: fullUrl });

    const response = await fetch(fullUrl, {
      headers: {
        "Accept": "audio/*,*/*",
      },
    });

    if (!response.ok) {
      logger.warn("Failed to download recording", {
        url: fullUrl,
        status: response.status,
        statusText: response.statusText
      });
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "audio/wav";

    // Extract filename from URL or use a default
    const urlPath = new URL(fullUrl).pathname;
    const filename = urlPath.split("/").pop() || "recording.wav";

    return { buffer, contentType, filename };
  } catch (error) {
    logger.error("Error downloading recording", {
      url: recordingUrl,
      error: (error as Error).message,
    });
    return null;
  }
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

  if (!tenant.threecx_host) {
    logger.info("No 3CX host configured for tenant", { tenantId: tenant.id });
    return result;
  }

  const threecxHost = tenant.threecx_host;

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
      logger.info("No new recordings to sync", { tenantId: tenant.id });
      await updateSyncStatus("recordings", "success", { recordsSynced: 0, tenantId: tenant.id });
      return result;
    }

    logger.info(`Processing ${recordings.length} recordings`, { tenantId: tenant.id });

    for (const recording of recordings) {
      try {
        if (!recording.recording_url) {
          logger.debug("Recording has no URL, skipping", { recordingId: recording.recording_id });
          result.filesSkipped++;
          continue;
        }

        // Generate storage path
        const filename = recording.recording_url.split("/").pop() || `recording_${recording.recording_id}.wav`;
        const storagePath = generateStoragePath(tenant.id, "recordings", filename);

        // Check if already uploaded
        const exists = await fileExists(storagePath);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        // Download the recording
        const downloadResult = await downloadRecording(recording.recording_url, threecxHost);
        if (!downloadResult) {
          result.errors.push({
            recordingId: recording.recording_id,
            error: "Failed to download recording",
          });
          continue;
        }

        // Upload to Supabase Storage
        const uploadResult = await uploadBuffer(
          downloadResult.buffer,
          storagePath,
          downloadResult.contentType
        );

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
          original_filename: downloadResult.filename,
          file_size: uploadResult.size,
          storage_path: uploadResult.path,
          mime_type: downloadResult.contentType,
          duration_seconds: durationSeconds || undefined,
          transcription: recording.transcription || undefined,
          recorded_at: recording.start_time?.toISOString() || new Date().toISOString(),
          call_started_at: recording.start_time?.toISOString(),
          call_ended_at: recording.end_time?.toISOString(),
        });

        result.filesSynced++;
        logger.debug(`Synced recording`, { tenantId: tenant.id, recordingId: recording.recording_id });
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

    await updateSyncStatus("recordings", "success", {
      recordsSynced: result.filesSynced,
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
  }
}
