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
import { insertVoicemail, updateSyncStatus } from "../storage/supabase";
import { TenantConfig } from "../storage/supabase";

export interface VoicemailsSyncResult {
  filesSynced: number;
  filesSkipped: number;
  errors: Array<{ filename: string; error: string }>;
}

// Parse voicemail filename to extract metadata
// 3CX typically stores voicemails in extension folders: /100/vm_20240115_143022.wav
function parseVoicemailPath(filePath: string): {
  extension?: string;
  timestamp?: Date;
  isUrgent?: boolean;
} {
  const result: { extension?: string; timestamp?: Date; isUrgent?: boolean } = {};

  // Extract extension from parent folder (e.g., /Voicemail/100/file.wav)
  const parts = filePath.split(path.sep);
  for (let i = parts.length - 2; i >= 0; i--) {
    if (/^\d{2,4}$/.test(parts[i])) {
      result.extension = parts[i];
      break;
    }
  }

  const filename = path.basename(filePath);

  // Check for urgent marker
  result.isUrgent = filename.toLowerCase().includes("urgent");

  // Try to extract timestamp from filename
  const dateMatch = filename.match(/(\d{8})_(\d{6})/);
  if (dateMatch) {
    const dateStr = dateMatch[1];
    const timeStr = dateMatch[2];
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    const hour = parseInt(timeStr.substring(0, 2));
    const minute = parseInt(timeStr.substring(2, 4));
    const second = parseInt(timeStr.substring(4, 6));
    result.timestamp = new Date(year, month, day, hour, minute, second);
  }

  return result;
}

// Get list of voicemail files from 3CX directory
function getVoicemailFiles(voicemailPath: string): string[] {
  try {
    if (!fs.existsSync(voicemailPath)) {
      logger.warn("Voicemail directory does not exist", { path: voicemailPath });
      return [];
    }

    const files: string[] = [];

    // Recursively find all audio files in extension folders
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

    scanDir(voicemailPath);
    logger.debug(`Found ${files.length} voicemail files`);
    return files;
  } catch (error) {
    logger.error("Failed to read voicemail directory", {
      error: (error as Error).message,
    });
    return [];
  }
}

export async function syncVoicemails(tenant: TenantConfig): Promise<VoicemailsSyncResult> {
  const result: VoicemailsSyncResult = {
    filesSynced: 0,
    filesSkipped: 0,
    errors: [],
  };

  if (!tenant.backup_voicemails) {
    logger.info("Voicemail backup disabled for tenant", { tenantId: tenant.id });
    return result;
  }

  try {
    await updateSyncStatus("voicemails", "running", { tenantId: tenant.id });

    const files = getVoicemailFiles(tenant.threecx_voicemail_path);

    if (files.length === 0) {
      logger.info("No voicemail files to sync", { tenantId: tenant.id });
      await updateSyncStatus("voicemails", "success", { recordsSynced: 0, tenantId: tenant.id });
      return result;
    }

    logger.info(`Processing ${files.length} voicemail files`, { tenantId: tenant.id });

    for (const filePath of files) {
      try {
        const filename = path.basename(filePath);
        const stat = fs.statSync(filePath);

        // Get file info
        const { mimeType } = getFileInfo(filename);
        const metadata = parseVoicemailPath(filePath);

        // Generate storage path
        const storagePath = generateStoragePath(tenant.id, "voicemails", filename);

        // Check if already uploaded
        const exists = await fileExists(storagePath);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        // Upload to Supabase Storage
        const uploadResult = await uploadFile(filePath, storagePath, mimeType);

        // Record in database
        await insertVoicemail({
          tenant_id: tenant.id,
          threecx_voicemail_id: filename,
          extension: metadata.extension || "unknown",
          original_filename: filename,
          file_size: uploadResult.size,
          storage_path: uploadResult.path,
          mime_type: mimeType,
          is_urgent: metadata.isUrgent || false,
          received_at: metadata.timestamp?.toISOString() || new Date(stat.mtime).toISOString(),
        });

        result.filesSynced++;
        logger.debug(`Synced voicemail`, { tenantId: tenant.id, filename });
      } catch (error) {
        const err = handleError(error);
        result.errors.push({
          filename: filePath,
          error: err.message,
        });
        logger.error("Failed to sync voicemail file", {
          tenantId: tenant.id,
          filePath,
          error: err.message,
        });
      }
    }

    await updateSyncStatus("voicemails", "success", {
      recordsSynced: result.filesSynced,
      tenantId: tenant.id,
    });

    logger.info("Voicemails sync completed", {
      tenantId: tenant.id,
      synced: result.filesSynced,
      skipped: result.filesSkipped,
      errors: result.errors.length,
    });

    return result;
  } catch (error) {
    const err = handleError(error);
    logger.error("Voicemails sync failed", { tenantId: tenant.id, error: err.message });
    await updateSyncStatus("voicemails", "error", {
      errorMessage: err.message,
      tenantId: tenant.id,
    });
    throw err;
  }
}
