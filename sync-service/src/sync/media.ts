import * as path from "path";
import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import {
  uploadFileBuffer,
  fileExists,
  detectFileType,
  generateStoragePath,
} from "../storage/supabase-storage";
import { insertMediaFileNew, updateSyncStatus } from "../storage/supabase";
import { createSftpClient, listRemoteFiles, downloadFile, closeSftpClient } from "../storage/sftp";
import { TenantConfig, getTenantSftpConfig } from "../tenant";

export interface MediaSyncResult {
  filesSynced: number;
  filesSkipped: number;
  errors: Array<{ filename: string; error: string }>;
}

export async function syncMedia(
  tenant: TenantConfig
): Promise<MediaSyncResult> {
  const result: MediaSyncResult = {
    filesSynced: 0,
    filesSkipped: 0,
    errors: [],
  };

  const tenantId = tenant.id;

  // Check if media backup is enabled for this tenant
  if (!tenant.backup_chat_media) {
    logger.info("Chat media backup disabled for tenant", { tenantId });
    return result;
  }

  // Get SFTP config for remote file access
  const sftpConfig = getTenantSftpConfig(tenant);
  if (!sftpConfig) {
    logger.info("No SFTP credentials configured - skipping media sync", { tenantId });
    return result;
  }

  const chatFilesPath = tenant.threecx_chat_files_path || "/var/lib/3cxpbx/Instance1/Data/Http/Files/Chat Files";

  let sftp;
  try {
    await updateSyncStatus("media", "running", { tenantId });

    // Connect to customer's 3CX server via SFTP
    logger.info("Connecting to 3CX server via SFTP", {
      tenantId,
      host: sftpConfig.host,
    });
    sftp = await createSftpClient(sftpConfig);

    // List files in chat directory
    const files = await listRemoteFiles(sftp, chatFilesPath);

    if (files.length === 0) {
      logger.info("No media files found on remote server", { tenantId, path: chatFilesPath });
      await updateSyncStatus("media", "success", { recordsSynced: 0, tenantId });
      return result;
    }

    logger.info(`Found ${files.length} files to process`, { tenantId });

    for (const filename of files) {
      try {
        const remotePath = path.posix.join(chatFilesPath, filename);

        // Download file from remote server
        const buffer = await downloadFile(sftp, remotePath);

        // Detect file type
        const { fileType, mimeType, extension } = detectFileType(buffer);

        // Generate storage path for Supabase Storage
        const storagePath = generateStoragePath(tenantId, "chat-media", filename, extension);

        // Check if already uploaded
        const exists = await fileExists(storagePath);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        // Upload to Supabase Storage
        const { path: uploadedPath, size } = await uploadFileBuffer(buffer, storagePath, mimeType);

        // Record in database
        await insertMediaFileNew({
          tenant_id: tenantId,
          original_filename: filename,
          stored_filename: `${path.basename(filename, path.extname(filename))}.${extension}`,
          file_type: fileType,
          mime_type: mimeType,
          file_size: size,
          storage_path: uploadedPath,
        });

        result.filesSynced++;
        logger.debug(`Synced media file via SFTP`, { tenantId, filename });
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
    errors: [],
  };

  if (!tenant.backup_recordings) {
    logger.info("Recordings backup disabled for tenant", { tenantId: tenant.id });
    return result;
  }

  const sftpConfig = getTenantSftpConfig(tenant);
  if (!sftpConfig) {
    return result;
  }

  const recordingsPath = tenant.threecx_recordings_path || "/var/lib/3cxpbx/Instance1/Data/Recordings";

  let sftp;
  try {
    sftp = await createSftpClient(sftpConfig);
    const files = await listRemoteFiles(sftp, recordingsPath);

    logger.info(`Found ${files.length} recordings to process`, { tenantId: tenant.id });

    for (const filename of files) {
      try {
        const remotePath = path.posix.join(recordingsPath, filename);
        const buffer = await downloadFile(sftp, remotePath);
        const { fileType, mimeType, extension } = detectFileType(buffer);
        const storagePath = generateStoragePath(tenant.id, "recordings", filename, extension);

        const exists = await fileExists(storagePath);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        const { path: uploadedPath, size } = await uploadFileBuffer(buffer, storagePath, mimeType);

        await insertMediaFileNew({
          tenant_id: tenant.id,
          original_filename: filename,
          stored_filename: `${path.basename(filename, path.extname(filename))}.${extension}`,
          file_type: "recording",
          mime_type: mimeType,
          file_size: size,
          storage_path: uploadedPath,
        });

        result.filesSynced++;
      } catch (error) {
        result.errors.push({ filename, error: (error as Error).message });
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
    errors: [],
  };

  if (!tenant.backup_voicemails) {
    return result;
  }

  const sftpConfig = getTenantSftpConfig(tenant);
  if (!sftpConfig) {
    return result;
  }

  const voicemailPath = tenant.threecx_voicemail_path || "/var/lib/3cxpbx/Instance1/Data/Voicemail";

  let sftp;
  try {
    sftp = await createSftpClient(sftpConfig);
    const files = await listRemoteFiles(sftp, voicemailPath);

    for (const filename of files) {
      try {
        const remotePath = path.posix.join(voicemailPath, filename);
        const buffer = await downloadFile(sftp, remotePath);
        const { mimeType, extension } = detectFileType(buffer);
        const storagePath = generateStoragePath(tenant.id, "voicemails", filename, extension);

        const exists = await fileExists(storagePath);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        const { path: uploadedPath, size } = await uploadFileBuffer(buffer, storagePath, mimeType);

        await insertMediaFileNew({
          tenant_id: tenant.id,
          original_filename: filename,
          stored_filename: filename,
          file_type: "voicemail",
          mime_type: mimeType,
          file_size: size,
          storage_path: uploadedPath,
        });

        result.filesSynced++;
      } catch (error) {
        result.errors.push({ filename, error: (error as Error).message });
      }
    }

    return result;
  } finally {
    if (sftp) {
      await closeSftpClient(sftp);
    }
  }
}
