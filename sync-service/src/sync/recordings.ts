import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import {
  uploadFile,
  generateStoragePath,
  fileExists,
  getFileInfo,
} from "../storage/supabase-storage";
import { insertCallRecording, updateSyncStatus } from "../storage/supabase";
import { TenantConfig } from "../storage/supabase";

export interface RecordingsSyncResult {
  filesSynced: number;
  filesSkipped: number;
  errors: Array<{ filename: string; error: string }>;
}

// Parse recording filename to extract metadata
// 3CX typically names recordings like: ext_100_20240115_143022_12345.wav
function parseRecordingFilename(filename: string): {
  extension?: string;
  timestamp?: Date;
  callId?: string;
} {
  const result: { extension?: string; timestamp?: Date; callId?: string } = {};

  // Try to match common 3CX recording patterns
  const patterns = [
    // ext_XXX_YYYYMMDD_HHMMSS_ID.wav
    /^ext_(\d+)_(\d{8})_(\d{6})_(\w+)\.\w+$/,
    // XXX_YYYYMMDD_HHMMSS.wav
    /^(\d+)_(\d{8})_(\d{6})\.\w+$/,
    // Generic with timestamp
    /(\d{8})_(\d{6})/,
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      if (match[1] && match[1].length <= 4) {
        result.extension = match[1];
      }
      if (match[2] && match[3]) {
        const dateStr = match[2];
        const timeStr = match[3];
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        const hour = parseInt(timeStr.substring(0, 2));
        const minute = parseInt(timeStr.substring(2, 4));
        const second = parseInt(timeStr.substring(4, 6));
        result.timestamp = new Date(year, month, day, hour, minute, second);
      }
      if (match[4]) {
        result.callId = match[4];
      }
      break;
    }
  }

  return result;
}

// Get list of recording files from 3CX directory
function getRecordingFiles(recordingsPath: string): string[] {
  try {
    if (!fs.existsSync(recordingsPath)) {
      logger.warn("Recordings directory does not exist", { path: recordingsPath });
      return [];
    }

    const files: string[] = [];

    // Recursively find all audio files
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if ([".wav", ".mp3", ".ogg", ".m4a"].includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }

    scanDir(recordingsPath);
    logger.debug(`Found ${files.length} recording files`);
    return files;
  } catch (error) {
    logger.error("Failed to read recordings directory", {
      error: (error as Error).message,
    });
    return [];
  }
}

export async function syncRecordings(tenant: TenantConfig): Promise<RecordingsSyncResult> {
  const result: RecordingsSyncResult = {
    filesSynced: 0,
    filesSkipped: 0,
    errors: [],
  };

  if (!tenant.backup_recordings) {
    logger.info("Recording backup disabled for tenant", { tenantId: tenant.id });
    return result;
  }

  try {
    await updateSyncStatus("recordings", "running", { tenantId: tenant.id });

    const files = getRecordingFiles(tenant.threecx_recordings_path);

    if (files.length === 0) {
      logger.info("No recording files to sync", { tenantId: tenant.id });
      await updateSyncStatus("recordings", "success", { recordsSynced: 0, tenantId: tenant.id });
      return result;
    }

    logger.info(`Processing ${files.length} recording files`, { tenantId: tenant.id });

    for (const filePath of files) {
      try {
        const filename = path.basename(filePath);
        const stat = fs.statSync(filePath);

        // Get file info
        const { mimeType } = getFileInfo(filename);
        const metadata = parseRecordingFilename(filename);

        // Generate storage path
        const storagePath = generateStoragePath(tenant.id, "recordings", filename);

        // Check if already uploaded
        const exists = await fileExists(storagePath);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        // Upload to Supabase Storage
        const uploadResult = await uploadFile(filePath, storagePath, mimeType);

        // Record in database
        await insertCallRecording({
          tenant_id: tenant.id,
          threecx_recording_id: filename,
          extension: metadata.extension,
          original_filename: filename,
          file_size: uploadResult.size,
          storage_path: uploadResult.path,
          mime_type: mimeType,
          recorded_at: metadata.timestamp?.toISOString() || new Date(stat.mtime).toISOString(),
          call_started_at: metadata.timestamp?.toISOString(),
        });

        result.filesSynced++;
        logger.debug(`Synced recording`, { tenantId: tenant.id, filename });
      } catch (error) {
        const err = handleError(error);
        result.errors.push({
          filename: filePath,
          error: err.message,
        });
        logger.error("Failed to sync recording file", {
          tenantId: tenant.id,
          filePath,
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
