import * as path from "path";
import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import {
  uploadBufferWithCompression,
  fileExists,
  detectFileType,
  generateStoragePath,
  getFileInfo,
  streamUpload,
} from "../storage/spaces-storage";
import { insertMediaFileNew, updateSyncStatus } from "../storage/supabase";
import {
  createSftpClient,
  listRemoteFilesRecursive,
  downloadFile,
  downloadFileStream,
  closeSftpClient,
  MAX_FILE_SIZE_BYTES,
  MAX_STREAM_FILE_SIZE_BYTES,
} from "../storage/sftp";
import { TenantConfig, getTenantSftpConfig } from "../tenant";
import { DEFAULT_COMPRESSION_SETTINGS } from "../utils/compression";

export interface MediaSyncResult {
  filesSynced: number;
  filesSkipped: number;
  filesTooLarge: number;
  errors: Array<{ filename: string; error: string }>;
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Common 3CX chat files paths to try
// Cloud-hosted 3CX stores chat attachments in /var/lib/3cxpbx/Instance1/Data/Chat
const CHAT_FILES_PATHS = [
  "/var/lib/3cxpbx/Instance1/Data/Chat",  // Cloud-hosted 3CX (Linux)
  "/var/lib/3cxpbx/Instance1/Data/Http/Files/Chat Files",
  "/var/lib/3cxpbx/Data/Http/Files/Chat Files",
  "/var/lib/3cxpbx/Data/Chat",
  "/home/phonesystem/.3CXPhone System/Data/Http/Files/Chat Files",
  "/var/lib/3cxpbx/Instance1/Data/Http/Files",
];

export async function syncMedia(
  tenant: TenantConfig
): Promise<MediaSyncResult> {
  const result: MediaSyncResult = {
    filesSynced: 0,
    filesSkipped: 0,
    filesTooLarge: 0,
    errors: [],
  };

  const tenantId = tenant.id;

  // Check if media backup is enabled for this tenant
  if (!tenant.backup_chat_media) {
    logger.info("Chat media backup disabled for tenant", { tenantId });
    await updateSyncStatus("media", "success", {
      recordsSynced: 0,
      notes: "Chat media backup disabled",
      tenantId,
    });
    return result;
  }

  // Get SFTP config for remote file access
  const sftpConfig = getTenantSftpConfig(tenant);
  if (!sftpConfig) {
    logger.info("No SFTP credentials configured - skipping media sync", { tenantId });
    await updateSyncStatus("media", "success", {
      recordsSynced: 0,
      notes: "No SFTP credentials configured - media sync skipped",
      tenantId,
    });
    return result;
  }

  // Build list of paths to try - custom path first if configured
  const pathsToTry = tenant.threecx_chat_files_path
    ? [tenant.threecx_chat_files_path, ...CHAT_FILES_PATHS]
    : CHAT_FILES_PATHS;

  let sftp;
  try {
    await updateSyncStatus("media", "running", { tenantId });

    // Connect to customer's 3CX server via SFTP
    logger.info("Connecting to 3CX server via SFTP", {
      tenantId,
      host: sftpConfig.host,
    });
    sftp = await createSftpClient(sftpConfig);

    // Try each path until we find one that exists
    let chatFilesPath: string | null = null;
    let files: Array<{ filename: string; relativePath: string; fullPath: string; size: number }> = [];

    for (const tryPath of pathsToTry) {
      logger.debug("Trying chat files path", { tenantId, path: tryPath });
      files = await listRemoteFilesRecursive(sftp, tryPath);
      if (files.length > 0) {
        chatFilesPath = tryPath;
        logger.info("Found chat files directory", { tenantId, path: tryPath, fileCount: files.length });
        break;
      }
    }

    if (files.length === 0 || !chatFilesPath) {
      const notes = `No chat media files found. Checked: ${pathsToTry.join(", ")}`;
      logger.info("No media files found on remote server", { tenantId, pathsTried: pathsToTry });
      await updateSyncStatus("media", "success", { recordsSynced: 0, notes, tenantId });
      return result;
    }

    logger.info(`Found ${files.length} files to process (including subfolders)`, { tenantId });

    for (const file of files) {
      try {
        // Check file size - skip files over streaming limit (500MB)
        if (file.size > MAX_STREAM_FILE_SIZE_BYTES) {
          logger.warn("Skipping extremely large file", {
            tenantId,
            filename: file.relativePath,
            size: formatBytes(file.size),
            maxSize: formatBytes(MAX_STREAM_FILE_SIZE_BYTES),
          });
          result.filesTooLarge++;
          continue;
        }

        // Determine upload strategy based on file size
        const useStreaming = file.size > MAX_FILE_SIZE_BYTES;

        // Log file info for debugging
        logger.debug("Processing media file", {
          tenantId,
          filename: file.filename,
          relativePath: file.relativePath,
          size: formatBytes(file.size),
          strategy: useStreaming ? "streaming" : "buffer",
        });

        // Get file info from filename for streaming (can't detect from buffer)
        const fileInfo = getFileInfo(file.filename);

        // Generate storage path - preserve subfolder structure
        const storagePath = generateStoragePath(tenantId, "chat-media", file.relativePath, fileInfo.extension);

        // Check if already uploaded
        const exists = await fileExists(storagePath);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        let uploadedPath: string;
        let uploadedSize: number;
        let mimeType: string;
        let fileType: string;

        if (useStreaming) {
          // STREAMING: For large files (25MB-500MB), stream directly to S3
          // No compression possible with streaming, but avoids memory issues
          logger.info("Using streaming upload for large file", {
            tenantId,
            filename: file.relativePath,
            size: formatBytes(file.size),
          });

          const stream = await downloadFileStream(sftp, file.fullPath);
          const streamResult = await streamUpload(stream, storagePath, fileInfo.mimeType, file.size);

          uploadedPath = streamResult.path;
          uploadedSize = file.size; // Use original size since no compression
          mimeType = fileInfo.mimeType;
          fileType = fileInfo.fileType;

          logger.info("Large file streamed successfully", {
            tenantId,
            filename: file.relativePath,
            size: formatBytes(file.size),
          });
        } else {
          // BUFFER: For smaller files (<25MB), download to buffer and compress
          const buffer = await downloadFile(sftp, file.fullPath);

          // Detect file type from buffer (more accurate than filename)
          const detected = detectFileType(buffer);
          fileType = detected.fileType;

          // Upload with compression
          const uploadResult = await uploadBufferWithCompression(
            buffer,
            storagePath,
            detected.fileType,
            detected.extension,
            DEFAULT_COMPRESSION_SETTINGS
          );

          uploadedPath = uploadResult.path;
          uploadedSize = uploadResult.size;
          mimeType = uploadResult.newMimeType;
        }

        // Record in database
        await insertMediaFileNew({
          tenant_id: tenantId,
          original_filename: file.filename,
          stored_filename: path.basename(uploadedPath),
          file_type: fileType,
          mime_type: mimeType,
          file_size: uploadedSize,
          storage_path: uploadedPath,
          storage_backend: "spaces",
        });

        result.filesSynced++;
        logger.debug(`Synced media file via SFTP`, { tenantId, filename: file.relativePath });
      } catch (error) {
        const err = handleError(error);
        result.errors.push({
          filename: file.relativePath,
          error: err.message,
        });
        logger.error("Failed to sync media file", {
          tenantId,
          filename: file.relativePath,
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
      tooLarge: result.filesTooLarge,
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
  } finally {
    if (sftp) {
      await closeSftpClient(sftp);
    }
  }
}

// Sync recordings via SFTP
export async function syncRecordings(
  tenant: TenantConfig
): Promise<MediaSyncResult> {
  const result: MediaSyncResult = {
    filesSynced: 0,
    filesSkipped: 0,
    filesTooLarge: 0,
    errors: [],
  };

  if (!tenant.backup_recordings) {
    logger.info("Recordings backup disabled for tenant", { tenantId: tenant.id });
    await updateSyncStatus("recordings", "success", {
      recordsSynced: 0,
      notes: "Recordings backup disabled",
      tenantId: tenant.id,
    });
    return result;
  }

  const sftpConfig = getTenantSftpConfig(tenant);
  if (!sftpConfig) {
    await updateSyncStatus("recordings", "success", {
      recordsSynced: 0,
      notes: "No SFTP credentials configured - recordings sync skipped",
      tenantId: tenant.id,
    });
    return result;
  }

  const recordingsPath = tenant.threecx_recordings_path || "/var/lib/3cxpbx/Instance1/Data/Recordings";

  let sftp;
  try {
    sftp = await createSftpClient(sftpConfig);
    const files = await listRemoteFilesRecursive(sftp, recordingsPath);

    logger.info(`Found ${files.length} recordings to process`, { tenantId: tenant.id });

    for (const file of files) {
      try {
        // Check file size before downloading
        if (file.size > MAX_FILE_SIZE_BYTES) {
          logger.warn("Skipping large recording", {
            tenantId: tenant.id,
            filename: file.filename,
            size: formatBytes(file.size),
          });
          result.filesTooLarge++;
          continue;
        }

        const buffer = await downloadFile(sftp, file.fullPath);
        const { fileType, extension } = detectFileType(buffer);
        const storagePath = generateStoragePath(tenant.id, "recordings", file.filename, extension);

        const exists = await fileExists(storagePath);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        // Upload with compression (recordings are often WAV, compress to MP3)
        const uploadResult = await uploadBufferWithCompression(
          buffer,
          storagePath,
          fileType,
          extension,
          DEFAULT_COMPRESSION_SETTINGS
        );

        await insertMediaFileNew({
          tenant_id: tenant.id,
          original_filename: file.filename,
          stored_filename: `${path.basename(file.filename, path.extname(file.filename))}.${uploadResult.newExtension}`,
          file_type: "recording",
          mime_type: uploadResult.newMimeType,
          file_size: uploadResult.size,
          storage_path: uploadResult.path,
          storage_backend: "spaces",
        });

        result.filesSynced++;

        if (uploadResult.wasCompressed) {
          logger.info("Recording compressed", {
            tenantId: tenant.id,
            filename: file.filename,
            savings: `${uploadResult.compressionRatio.toFixed(1)}%`,
          });
        }
      } catch (error) {
        result.errors.push({ filename: file.filename, error: (error as Error).message });
      }
    }

    return result;
  } finally {
    if (sftp) {
      await closeSftpClient(sftp);
    }
  }
}

// Sync voicemails via SFTP
export async function syncVoicemails(
  tenant: TenantConfig
): Promise<MediaSyncResult> {
  const result: MediaSyncResult = {
    filesSynced: 0,
    filesSkipped: 0,
    filesTooLarge: 0,
    errors: [],
  };

  if (!tenant.backup_voicemails) {
    await updateSyncStatus("voicemails", "success", {
      recordsSynced: 0,
      notes: "Voicemails backup disabled",
      tenantId: tenant.id,
    });
    return result;
  }

  const sftpConfig = getTenantSftpConfig(tenant);
  if (!sftpConfig) {
    await updateSyncStatus("voicemails", "success", {
      recordsSynced: 0,
      notes: "No SFTP credentials configured - voicemails sync skipped",
      tenantId: tenant.id,
    });
    return result;
  }

  const voicemailPath = tenant.threecx_voicemail_path || "/var/lib/3cxpbx/Instance1/Data/Voicemail";

  let sftp;
  try {
    sftp = await createSftpClient(sftpConfig);
    const files = await listRemoteFilesRecursive(sftp, voicemailPath);

    for (const file of files) {
      try {
        // Check file size before downloading
        if (file.size > MAX_FILE_SIZE_BYTES) {
          logger.warn("Skipping large voicemail", {
            tenantId: tenant.id,
            filename: file.filename,
            size: formatBytes(file.size),
          });
          result.filesTooLarge++;
          continue;
        }

        const buffer = await downloadFile(sftp, file.fullPath);
        const { fileType, extension } = detectFileType(buffer);
        const storagePath = generateStoragePath(tenant.id, "voicemails", file.filename, extension);

        const exists = await fileExists(storagePath);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        // Upload with compression (voicemails are often WAV, compress to MP3)
        const uploadResult = await uploadBufferWithCompression(
          buffer,
          storagePath,
          fileType,
          extension,
          DEFAULT_COMPRESSION_SETTINGS
        );

        await insertMediaFileNew({
          tenant_id: tenant.id,
          original_filename: file.filename,
          stored_filename: `${path.basename(file.filename, path.extname(file.filename))}.${uploadResult.newExtension}`,
          file_type: "voicemail",
          mime_type: uploadResult.newMimeType,
          file_size: uploadResult.size,
          storage_path: uploadResult.path,
          storage_backend: "spaces",
        });

        result.filesSynced++;

        if (uploadResult.wasCompressed) {
          logger.info("Voicemail compressed", {
            tenantId: tenant.id,
            filename: file.filename,
            savings: `${uploadResult.compressionRatio.toFixed(1)}%`,
          });
        }
      } catch (error) {
        result.errors.push({ filename: file.filename, error: (error as Error).message });
      }
    }

    return result;
  } finally {
    if (sftp) {
      await closeSftpClient(sftp);
    }
  }
}
