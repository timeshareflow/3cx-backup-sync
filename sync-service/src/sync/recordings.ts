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
  streamUpload,
} from "../storage/spaces-storage";
import {
  createSftpClient,
  downloadFile,
  downloadFileStream,
  closeSftpClient,
  getRemoteFileSize,
  MAX_FILE_SIZE_BYTES,
  MAX_STREAM_FILE_SIZE_BYTES,
} from "../storage/sftp";
import { insertCallRecording, updateSyncStatus, getLastSyncedTimestamp } from "../storage/supabase";
import { TenantConfig, getTenantSftpConfig } from "../tenant";
import { getRecordings } from "../threecx/queries";
import { DEFAULT_COMPRESSION_SETTINGS } from "../utils/compression";

export interface RecordingsSyncResult {
  filesSynced: number;
  filesSkipped: number;
  errors: Array<{ recordingId: string; error: string }>;
}

// Default recordings base path on 3CX servers
const DEFAULT_RECORDINGS_BASE = "/var/lib/3cxpbx/Instance1/Data/Recordings";

/**
 * Parse recording filename to extract caller/callee information
 * Filename patterns:
 * - [Extension Name]_ExtNumber-PhoneNumber_DateTime(ID).wav
 * - Example: [Tampa South]_302-+18139975575_20260130152748(84).wav
 * - Example: [Sales]_101-102_20260130120000(12).wav (internal call)
 */
interface ParsedFilename {
  extensionName: string | null;
  extensionNumber: string | null;
  phoneNumber: string | null;
  callerNumber: string | null;
  calleeNumber: string | null;
  callerName: string | null;
  direction: "inbound" | "outbound" | "internal" | null;
}

function parseRecordingFilename(filename: string): ParsedFilename {
  const result: ParsedFilename = {
    extensionName: null,
    extensionNumber: null,
    phoneNumber: null,
    callerNumber: null,
    calleeNumber: null,
    callerName: null,
    direction: null,
  };

  // Pattern: [Extension Name]_ExtNumber-PhoneNumber_DateTime(ID).wav
  // or: [Extension Name]_ExtNumber-ExtNumber_DateTime(ID).wav (internal)
  const match = filename.match(/^\[([^\]]+)\]_(\d+)-([^_]+)_\d+\(\d+\)/);

  if (!match) {
    // Try alternate pattern without brackets: ExtNumber-PhoneNumber_DateTime.wav
    const altMatch = filename.match(/^(\d+)-([^_]+)_\d+/);
    if (altMatch) {
      result.extensionNumber = altMatch[1];
      result.phoneNumber = altMatch[2];
    }
    return result;
  }

  result.extensionName = match[1];
  result.extensionNumber = match[2];
  result.phoneNumber = match[3];

  // Determine if this is an internal call (extension to extension)
  const isPhoneExtension = /^\d{2,4}$/.test(result.phoneNumber);
  const isPhoneExternal = result.phoneNumber.length >= 10 || result.phoneNumber.startsWith("+");

  // The extension number in the filename is the local party
  // The phone number is the remote party
  // For recordings, the local extension is typically the one doing the recording

  if (isPhoneExtension) {
    // Internal call between two extensions
    result.direction = "internal";
    result.callerNumber = result.extensionNumber;
    result.calleeNumber = result.phoneNumber;
    result.callerName = result.extensionName;
  } else if (isPhoneExternal) {
    // External call - need to determine direction
    // If the external number starts with + or has many digits, it's likely an external number
    // The extension in the filename is the local party
    // For outbound: extension calls external number
    // For inbound: external number calls extension

    // Check if this looks like an outbound call based on filename structure
    // Typically [Ext Name]_ExtNum-ExternalNum means extension called external
    result.direction = "outbound";
    result.callerNumber = result.extensionNumber;
    result.callerName = result.extensionName;
    result.calleeNumber = result.phoneNumber;
  }

  return result;
}

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

        // Check if already in database (not just storage) to handle partial syncs
        const { recordingExists } = await import("../storage/supabase");
        const existsInDb = await recordingExists(tenant.id, recording.recording_id);
        if (existsInDb) {
          result.filesSkipped++;
          continue;
        }

        // Also check storage in case file was uploaded but DB insert failed
        const existsInStorage = await fileExists(storagePath);

        let uploadResult: { path: string; size: number; newMimeType: string; wasCompressed: boolean; originalSize: number; compressionRatio: number };

        if (existsInStorage) {
          // File exists in storage but not in DB - just create DB record
          logger.debug("File exists in storage, creating DB record only", {
            tenantId: tenant.id,
            recordingId: recording.recording_id,
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
          // Download the recording via SFTP
          logger.debug("Downloading recording via SFTP", {
            tenantId: tenant.id,
            recordingId: recording.recording_id,
            remotePath,
          });

          // Find valid path and get file size first
          let validPath = remotePath;
          let fileSize = await getRemoteFileSize(sftp, remotePath);

          if (fileSize < 0) {
            // Try alternate path patterns if the first one fails
            const altPaths = [
              path.posix.join(recordingsBasePath, recording.extension_number || "", "Recordings", filename),
              path.posix.join(recordingsBasePath, recording.extension_number || "", filename),
              path.posix.join(recordingsBasePath, filename),
            ];

            for (const altPath of altPaths) {
              if (altPath === remotePath) continue;
              const altSize = await getRemoteFileSize(sftp, altPath);
              if (altSize >= 0) {
                validPath = altPath;
                fileSize = altSize;
                logger.debug("Found file at alternate path", { altPath, size: fileSize });
                break;
              }
            }

            if (fileSize < 0) {
              result.errors.push({
                recordingId: recording.recording_id,
                error: `Failed to download: file not found at ${remotePath}`,
              });
              continue;
            }
          }

          // Skip files over streaming limit (500MB)
          if (fileSize > MAX_STREAM_FILE_SIZE_BYTES) {
            logger.warn("Skipping extremely large recording", {
              tenantId: tenant.id,
              recordingId: recording.recording_id,
              size: `${(fileSize / 1024 / 1024).toFixed(1)}MB`,
            });
            result.filesSkipped++;
            continue;
          }

          // Decide strategy based on file size
          const useStreaming = fileSize > MAX_FILE_SIZE_BYTES;
          const fileInfo = getFileInfo(filename);

          if (useStreaming) {
            // STREAMING: Large files (25MB-500MB) - stream directly, no compression
            logger.info("Using streaming upload for large recording", {
              tenantId: tenant.id,
              recordingId: recording.recording_id,
              size: `${(fileSize / 1024 / 1024).toFixed(1)}MB`,
            });

            const stream = await downloadFileStream(sftp, validPath);
            const streamResult = await streamUpload(stream, storagePath, fileInfo.mimeType, fileSize);

            uploadResult = {
              path: streamResult.path,
              size: fileSize,
              newMimeType: fileInfo.mimeType,
              wasCompressed: false,
              originalSize: fileSize,
              compressionRatio: 0,
            };

            logger.info("Large recording streamed successfully", {
              tenantId: tenant.id,
              recordingId: recording.recording_id,
            });
          } else {
            // BUFFER: Smaller files (<25MB) - download to buffer and compress
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
        }

        // Calculate duration
        const durationSeconds = recording.duration_seconds ||
          (recording.start_time && recording.end_time
            ? Math.floor((new Date(recording.end_time).getTime() - new Date(recording.start_time).getTime()) / 1000)
            : null);

        // Parse filename to extract caller/callee info if not available from query
        const parsedFilename = parseRecordingFilename(filename);

        // Use query data first, fall back to parsed filename
        const callerNum = recording.caller_number || parsedFilename.callerNumber || "";
        const calleeNum = recording.callee_number || parsedFilename.calleeNumber || "";
        const callerName = parsedFilename.callerName || undefined;
        const extensionNum = recording.extension_number || parsedFilename.extensionNumber || undefined;

        // Determine direction from caller/callee numbers or parsed filename
        let direction: "inbound" | "outbound" | "internal" | undefined = parsedFilename.direction || undefined;

        if (!direction) {
          const isCallerExtension = /^\d{2,4}$/.test(callerNum);
          const isCalleeExtension = /^\d{2,4}$/.test(calleeNum);
          const isCallerExternal = callerNum.length >= 10 || callerNum.startsWith("+");
          const isCalleeExternal = calleeNum.length >= 10 || calleeNum.startsWith("+");

          if (isCallerExtension && isCalleeExternal) {
            direction = "outbound";
          } else if (isCallerExternal && isCalleeExtension) {
            direction = "inbound";
          } else if (isCallerExtension && isCalleeExtension) {
            direction = "internal";
          }
        }

        // Log the parsed data for debugging
        if (parsedFilename.extensionNumber || parsedFilename.phoneNumber) {
          logger.debug("Parsed filename data", {
            tenantId: tenant.id,
            filename,
            parsed: parsedFilename,
          });
        }

        // Record in database with compressed file info
        await insertCallRecording({
          tenant_id: tenant.id,
          threecx_recording_id: recording.recording_id,
          extension: extensionNum,
          caller_number: callerNum || undefined,
          callee_number: calleeNum || undefined,
          caller_name: callerName,
          original_filename: filename,
          file_size: uploadResult.size,
          storage_path: uploadResult.path,
          mime_type: uploadResult.newMimeType,
          duration_seconds: durationSeconds || undefined,
          direction,
          transcription: recording.transcription || undefined,
          recorded_at: recording.start_time?.toISOString() || new Date().toISOString(),
          call_started_at: recording.start_time?.toISOString(),
          call_ended_at: recording.end_time?.toISOString(),
          storage_backend: "spaces",
        });

        result.filesSynced++;

        if (uploadResult.wasCompressed) {
          logger.info("Recording compressed", {
            tenantId: tenant.id,
            recordingId: recording.recording_id,
            originalSize: `${(uploadResult.originalSize / 1024 / 1024).toFixed(2)}MB`,
            compressedSize: `${(uploadResult.size / 1024 / 1024).toFixed(2)}MB`,
            savings: `${uploadResult.compressionRatio.toFixed(1)}%`,
          });
        }

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
    let notes = `Synced ${result.filesSynced} new, ${result.filesSkipped} already synced`;
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
