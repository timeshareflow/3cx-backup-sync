import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import {
  uploadFile,
  fileExists,
  detectFileType,
} from "../storage/s3";
import { insertMediaFile, updateSyncStatus } from "../storage/supabase";

const DEFAULT_CHAT_FILES_PATH =
  process.env.THREECX_CHAT_FILES_PATH ||
  "/var/lib/3cxpbx/Instance1/Data/Chat";

export interface MediaSyncResult {
  filesSynced: number;
  filesSkipped: number;
  errors: Array<{ filename: string; error: string }>;
}

// Get list of chat media files from 3CX directory
function getChatFiles(chatFilesPath: string): string[] {
  try {
    if (!fs.existsSync(chatFilesPath)) {
      logger.warn("Chat files directory does not exist", {
        path: chatFilesPath,
      });
      return [];
    }

    const files = fs.readdirSync(chatFilesPath);
    logger.debug(`Found ${files.length} files in chat directory`);
    return files;
  } catch (error) {
    logger.error("Failed to read chat files directory", {
      error: (error as Error).message,
    });
    return [];
  }
}

// Generate S3 key for media file
function generateS3Key(filename: string, extension: string, tenantId?: string): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  const prefix = tenantId ? `${tenantId}/` : "";
  return `${prefix}media/${year}/${month}/${filename}.${extension}`;
}

export async function syncMedia(
  tenantId?: string,
  chatFilesPath?: string
): Promise<MediaSyncResult> {
  const result: MediaSyncResult = {
    filesSynced: 0,
    filesSkipped: 0,
    errors: [],
  };

  const filesPath = chatFilesPath || DEFAULT_CHAT_FILES_PATH;

  try {
    await updateSyncStatus("media", "running", { tenantId });

    const files = getChatFiles(filesPath);

    if (files.length === 0) {
      logger.info("No media files to sync", { tenantId });
      await updateSyncStatus("media", "success", { recordsSynced: 0, tenantId });
      return result;
    }

    logger.info(`Processing ${files.length} potential media files`, { tenantId });

    for (const filename of files) {
      try {
        const localPath = path.join(filesPath, filename);

        // Skip directories
        const stat = fs.statSync(localPath);
        if (stat.isDirectory()) {
          continue;
        }

        // Read file and detect type
        const buffer = fs.readFileSync(localPath);
        const { fileType, mimeType, extension } = detectFileType(buffer);

        // Generate S3 key (including tenant prefix for isolation)
        const s3Key = generateS3Key(filename, extension, tenantId);

        // Check if already uploaded
        const exists = await fileExists(s3Key);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        // Upload to S3
        const fullS3Key = await uploadFile(localPath, s3Key, mimeType);

        // Record in database
        await insertMediaFile({
          original_filename: `${filename}.${extension}`,
          stored_filename: filename,
          file_type: fileType,
          mime_type: mimeType,
          file_size_bytes: stat.size,
          s3_key: fullS3Key,
          s3_bucket: process.env.S3_BUCKET_NAME!,
          // Note: message_id and conversation_id would need to be linked
          // based on 3CX's file naming convention or metadata
          conversation_id: "", // Would need to extract from filename pattern
        });

        result.filesSynced++;
        logger.debug(`Synced media file`, { tenantId, filename, s3Key: fullS3Key });
      } catch (error) {
        const err = handleError(error);
        result.errors.push({
          filename,
          error: err.message,
        });
        logger.error("Failed to sync media file", {
          tenantId,
          filename,
          error: err.message,
        });
      }
    }

    await updateSyncStatus("media", "success", {
      recordsSynced: result.filesSynced,
      tenantId,
    });

    logger.info("Media sync completed", {
      tenantId,
      synced: result.filesSynced,
      skipped: result.filesSkipped,
      errors: result.errors.length,
    });

    return result;
  } catch (error) {
    const err = handleError(error);
    logger.error("Media sync failed", { tenantId, error: err.message });
    await updateSyncStatus("media", "error", {
      errorMessage: err.message,
      tenantId,
    });
    throw err;
  }
}
