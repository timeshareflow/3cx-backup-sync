import * as path from "path";
import { Pool } from "pg";
import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import {
  uploadBufferWithCompression,
  generateStoragePath,
  fileExists,
  detectFileType,
  getFileInfo,
} from "../storage/spaces-storage";
import {
  createSftpClient,
  downloadFile,
  closeSftpClient,
  getRemoteFileSize,
  MAX_FILE_SIZE_BYTES,
} from "../storage/sftp";
import { insertVoicemail, updateSyncStatus, getLastSyncedTimestamp, voicemailExists } from "../storage/supabase";
import { TenantConfig, getTenantSftpConfig } from "../tenant";
import { getVoicemails } from "../threecx/queries";
import { DEFAULT_COMPRESSION_SETTINGS } from "../utils/compression";

export interface VoicemailsSyncResult {
  filesSynced: number;
  filesSkipped: number;
  errors: Array<{ voicemailId: string; error: string }>;
}

// Default voicemail base path on 3CX servers
// 3CX hosted uses: /var/lib/3cxpbx/Instance1/Data/Ivr/Voicemail
const DEFAULT_VOICEMAIL_BASE = "/var/lib/3cxpbx/Instance1/Data/Ivr/Voicemail";

export async function syncVoicemails(
  tenant: TenantConfig,
  pool: Pool
): Promise<VoicemailsSyncResult> {
  const result: VoicemailsSyncResult = {
    filesSynced: 0,
    filesSkipped: 0,
    errors: [],
  };

  if (!tenant.backup_voicemails) {
    logger.info("Voicemail backup disabled for tenant", { tenantId: tenant.id });
    return result;
  }

  // Get SFTP config for downloading voicemails
  const sftpConfig = getTenantSftpConfig(tenant);
  if (!sftpConfig) {
    logger.info("No SFTP credentials configured - skipping voicemails sync", { tenantId: tenant.id });
    return result;
  }

  const voicemailBasePath = tenant.threecx_voicemail_path || DEFAULT_VOICEMAIL_BASE;

  let sftp;
  try {
    await updateSyncStatus("voicemails", "running", { tenantId: tenant.id });

    // Get last sync timestamp to only fetch new records
    const lastSync = await getLastSyncedTimestamp("voicemails", tenant.id);
    const since = lastSync ? new Date(lastSync) : null;

    logger.info("Fetching voicemails from 3CX database", {
      tenantId: tenant.id,
      since: since?.toISOString() || "beginning",
    });

    // Fetch voicemails from 3CX database
    const voicemails = await getVoicemails(since, 500, pool);

    if (voicemails.length === 0) {
      const notes = since ? "No new voicemails since last sync" : "No voicemails found in 3CX database";
      logger.info("No new voicemails to sync", { tenantId: tenant.id });
      await updateSyncStatus("voicemails", "success", { recordsSynced: 0, notes, tenantId: tenant.id });
      return result;
    }

    logger.info(`Processing ${voicemails.length} voicemails`, { tenantId: tenant.id });

    // Connect to SFTP
    logger.info("Connecting to 3CX server via SFTP for voicemails", {
      tenantId: tenant.id,
      host: sftpConfig.host,
    });
    sftp = await createSftpClient(sftpConfig);

    for (const voicemail of voicemails) {
      try {
        if (!voicemail.wav_file) {
          logger.debug("Voicemail has no wav_file, skipping", { voicemailId: voicemail.voicemail_id });
          result.filesSkipped++;
          continue;
        }

        const filename = `${voicemail.wav_file}.wav`;

        // Check if already in database
        const existsInDb = await voicemailExists(tenant.id, voicemail.voicemail_id);
        if (existsInDb) {
          result.filesSkipped++;
          continue;
        }

        // Generate storage path
        const storagePath = generateStoragePath(tenant.id, "voicemails", filename);

        // Check if already in storage
        const existsInStorage = await fileExists(storagePath);

        let uploadResult: { path: string; size: number; newMimeType: string; wasCompressed: boolean; originalSize: number; compressionRatio: number };

        if (existsInStorage) {
          // File exists in storage but not in DB - just create DB record
          logger.debug("File exists in storage, creating DB record only", {
            tenantId: tenant.id,
            voicemailId: voicemail.voicemail_id,
            storagePath,
          });
          uploadResult = {
            path: storagePath,
            size: 0,
            newMimeType: "audio/wav",
            wasCompressed: false,
            originalSize: 0,
            compressionRatio: 0,
          };
        } else {
          // Build possible paths for the voicemail file
          // 3CX stores voicemails in: /var/lib/3cxpbx/Instance1/Data/Ivr/Voicemail/Extensions/{extension}/{wav_file}.wav
          const possiblePaths = [
            // Try Extensions subfolder first (most common for 3CX hosted)
            path.posix.join(voicemailBasePath, "Extensions", voicemail.extension, filename),
            path.posix.join(voicemailBasePath, "Extensions", voicemail.extension, voicemail.wav_file),
            // Try Data subfolder
            path.posix.join(voicemailBasePath, "Data", voicemail.extension, filename),
            path.posix.join(voicemailBasePath, "Data", voicemail.extension, voicemail.wav_file),
            // Direct paths (legacy format)
            path.posix.join(voicemailBasePath, voicemail.extension, filename),
            path.posix.join(voicemailBasePath, voicemail.extension, voicemail.wav_file),
            path.posix.join(voicemailBasePath, filename),
          ];

          let validPath: string | null = null;
          let fileSize = -1;

          for (const testPath of possiblePaths) {
            const size = await getRemoteFileSize(sftp, testPath);
            if (size >= 0) {
              validPath = testPath;
              fileSize = size;
              logger.debug("Found voicemail file at path", { path: testPath, size: fileSize });
              break;
            }
          }

          if (!validPath || fileSize < 0) {
            result.errors.push({
              voicemailId: voicemail.voicemail_id,
              error: `File not found at any expected path`,
            });
            continue;
          }

          // Skip files that are too large
          if (fileSize > MAX_FILE_SIZE_BYTES) {
            logger.warn("Skipping large voicemail", {
              tenantId: tenant.id,
              voicemailId: voicemail.voicemail_id,
              size: `${(fileSize / 1024 / 1024).toFixed(1)}MB`,
            });
            result.filesSkipped++;
            continue;
          }

          // Download and upload
          logger.debug("Downloading voicemail via SFTP", {
            tenantId: tenant.id,
            voicemailId: voicemail.voicemail_id,
            remotePath: validPath,
          });

          const buffer = await downloadFile(sftp, validPath);
          const { fileType, extension } = detectFileType(buffer);

          uploadResult = await uploadBufferWithCompression(
            buffer,
            storagePath,
            fileType,
            extension,
            DEFAULT_COMPRESSION_SETTINGS
          );
        }

        // Calculate duration in seconds from milliseconds
        const durationSeconds = voicemail.duration_ms
          ? Math.round(voicemail.duration_ms / 1000)
          : null;

        // Record in database
        await insertVoicemail({
          tenant_id: tenant.id,
          threecx_voicemail_id: voicemail.voicemail_id,
          extension: voicemail.extension,
          caller_number: voicemail.caller_number || undefined,
          caller_name: voicemail.caller_name || undefined,
          original_filename: filename,
          file_size: uploadResult.size,
          storage_path: uploadResult.path,
          mime_type: uploadResult.newMimeType,
          duration_seconds: durationSeconds || undefined,
          is_read: voicemail.is_heard,
          transcription: voicemail.transcription || undefined,
          received_at: voicemail.created_at?.toISOString() || new Date().toISOString(),
          storage_backend: "spaces",
        });

        result.filesSynced++;

        if (uploadResult.wasCompressed) {
          logger.info("Voicemail compressed", {
            tenantId: tenant.id,
            voicemailId: voicemail.voicemail_id,
            originalSize: `${(uploadResult.originalSize / 1024 / 1024).toFixed(2)}MB`,
            compressedSize: `${(uploadResult.size / 1024 / 1024).toFixed(2)}MB`,
            savings: `${uploadResult.compressionRatio.toFixed(1)}%`,
          });
        }

        logger.debug(`Synced voicemail`, { tenantId: tenant.id, voicemailId: voicemail.voicemail_id });
      } catch (error) {
        const err = handleError(error);
        // Skip duplicates silently
        if (err.message.includes("duplicate") || err.message.includes("23505")) {
          result.filesSkipped++;
          continue;
        }
        result.errors.push({
          voicemailId: voicemail.voicemail_id,
          error: err.message,
        });
        logger.error("Failed to sync voicemail", {
          tenantId: tenant.id,
          voicemailId: voicemail.voicemail_id,
          error: err.message,
        });
      }
    }

    // Build notes with summary
    let notes = `Synced ${result.filesSynced}, skipped ${result.filesSkipped}`;
    if (result.errors.length > 0) {
      notes += `, ${result.errors.length} failed`;
    }

    await updateSyncStatus("voicemails", "success", {
      recordsSynced: result.filesSynced,
      notes,
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
  } finally {
    if (sftp) {
      await closeSftpClient(sftp);
    }
  }
}
