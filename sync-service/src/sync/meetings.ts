import * as path from "path";
import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import {
  uploadFileBuffer,
  generateStoragePath,
  fileExists,
  detectFileType,
} from "../storage/supabase-storage";
import { insertMeetingRecording, updateSyncStatus } from "../storage/supabase";
import { createSftpClient, listRemoteFiles, closeSftpClient, downloadFile } from "../storage/sftp";
import { TenantConfig, getTenantSftpConfig } from "../tenant";

export interface MeetingsSyncResult {
  filesSynced: number;
  filesSkipped: number;
  errors: Array<{ filename: string; error: string }>;
}

// Common 3CX meeting recording paths to try
const MEETINGS_PATHS = [
  "/var/lib/3cxpbx/Instance1/Data/Recordings/Meetings",
  "/var/lib/3cxpbx/Instance1/Data/WebMeetings",
  "/var/lib/3cxpbx/Data/Recordings/Meetings",
  "/var/lib/3cxpbx/Data/WebMeetings",
  "/home/phonesystem/.3CXPhone System/Data/Recordings/Meetings",
];

// Parse meeting recording filename to extract metadata
// 3CX web meeting recordings typically named like:
// - Meeting_Room_Name_20240115_143022.mp4
// - Webmeeting_12345_20240115.mp4
// - Conference_ext100_20240115_143022.mp4
function parseMeetingFilename(filename: string): {
  meetingName?: string;
  hostExtension?: string;
  timestamp?: Date;
  meetingId?: string;
} {
  const result: {
    meetingName?: string;
    hostExtension?: string;
    timestamp?: Date;
    meetingId?: string;
  } = {};

  // Remove extension for parsing
  const nameWithoutExt = filename.replace(/\.\w+$/, "");

  // Try to match common 3CX meeting recording patterns
  const patterns = [
    // Meeting_Name_YYYYMMDD_HHMMSS
    /^(.+?)_(\d{8})_(\d{6})$/,
    // Webmeeting_ID_YYYYMMDD
    /^Webmeeting_(\w+)_(\d{8})$/,
    // Conference_extXXX_YYYYMMDD_HHMMSS
    /^Conference_ext(\d+)_(\d{8})_(\d{6})$/,
    // Generic with timestamp
    /(\d{8})_(\d{6})/,
  ];

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const match = nameWithoutExt.match(pattern);

    if (match) {
      if (i === 0) {
        // Meeting_Name_YYYYMMDD_HHMMSS
        result.meetingName = match[1].replace(/_/g, " ");
        const dateStr = match[2];
        const timeStr = match[3];
        result.timestamp = parseDateTime(dateStr, timeStr);
      } else if (i === 1) {
        // Webmeeting_ID_YYYYMMDD
        result.meetingId = match[1];
        result.meetingName = `Web Meeting ${match[1]}`;
        result.timestamp = parseDateTime(match[2]);
      } else if (i === 2) {
        // Conference_extXXX_YYYYMMDD_HHMMSS
        result.hostExtension = match[1];
        result.meetingName = `Conference (ext ${match[1]})`;
        result.timestamp = parseDateTime(match[2], match[3]);
      } else if (i === 3) {
        // Generic timestamp
        result.timestamp = parseDateTime(match[1], match[2]);
        result.meetingName = nameWithoutExt.split("_")[0];
      }
      break;
    }
  }

  // Use unique part of filename as meeting ID if not found
  if (!result.meetingId) {
    result.meetingId = nameWithoutExt;
  }

  return result;
}

function parseDateTime(dateStr: string, timeStr?: string): Date | undefined {
  try {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));

    if (timeStr) {
      const hour = parseInt(timeStr.substring(0, 2));
      const minute = parseInt(timeStr.substring(2, 4));
      const second = parseInt(timeStr.substring(4, 6)) || 0;
      return new Date(year, month, day, hour, minute, second);
    }

    return new Date(year, month, day);
  } catch {
    return undefined;
  }
}

export async function syncMeetings(tenant: TenantConfig): Promise<MeetingsSyncResult> {
  const result: MeetingsSyncResult = {
    filesSynced: 0,
    filesSkipped: 0,
    errors: [],
  };

  if (!tenant.backup_meetings) {
    logger.info("Meeting backup disabled for tenant", { tenantId: tenant.id });
    await updateSyncStatus("meetings", "success", {
      recordsSynced: 0,
      notes: "Meetings backup disabled",
      tenantId: tenant.id,
    });
    return result;
  }

  const sftpConfig = getTenantSftpConfig(tenant);
  if (!sftpConfig) {
    logger.info("No SFTP credentials configured - skipping meetings sync", { tenantId: tenant.id });
    await updateSyncStatus("meetings", "success", {
      recordsSynced: 0,
      notes: "No SFTP credentials configured - meetings sync skipped",
      tenantId: tenant.id,
    });
    return result;
  }

  // Build list of paths to try - custom path first if configured
  const pathsToTry = tenant.threecx_meetings_path
    ? [tenant.threecx_meetings_path, ...MEETINGS_PATHS]
    : MEETINGS_PATHS;

  let sftp;
  try {
    await updateSyncStatus("meetings", "running", { tenantId: tenant.id });

    sftp = await createSftpClient(sftpConfig);

    // Try each path until we find one that exists
    let meetingsPath: string | null = null;
    let files: string[] = [];

    for (const tryPath of pathsToTry) {
      logger.debug("Trying meetings path", { tenantId: tenant.id, path: tryPath });
      try {
        files = await listRemoteFiles(sftp, tryPath);
        // Filter to video/audio files
        files = files.filter(f => {
          const ext = path.extname(f).toLowerCase();
          return [".mp4", ".webm", ".mkv", ".avi", ".mov", ".wav", ".mp3", ".ogg"].includes(ext);
        });
        if (files.length > 0) {
          meetingsPath = tryPath;
          logger.info("Found meetings directory", { tenantId: tenant.id, path: tryPath, fileCount: files.length });
          break;
        }
      } catch {
        // Path doesn't exist, try next
        continue;
      }
    }

    if (files.length === 0 || !meetingsPath) {
      const notes = `No meeting recordings found. Checked: ${pathsToTry.join(", ")}`;
      logger.info("No meeting recording files found on remote server", { tenantId: tenant.id, pathsTried: pathsToTry });
      await updateSyncStatus("meetings", "success", { recordsSynced: 0, notes, tenantId: tenant.id });
      return result;
    }

    logger.info(`Found ${files.length} meeting recording files to process`, { tenantId: tenant.id });

    for (const filename of files) {
      try {
        const remotePath = path.posix.join(meetingsPath, filename);
        const buffer = await downloadFile(sftp, remotePath);
        const { mimeType, extension } = detectFileType(buffer);
        const metadata = parseMeetingFilename(filename);

        const storagePath = generateStoragePath(tenant.id, "meetings", filename, extension);

        const exists = await fileExists(storagePath);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        // Determine if it's video or audio only
        const ext = path.extname(filename).toLowerCase();
        const isVideo = [".mp4", ".webm", ".mkv", ".avi", ".mov"].includes(ext);

        const { path: uploadedPath, size } = await uploadFileBuffer(buffer, storagePath, mimeType);

        await insertMeetingRecording({
          tenant_id: tenant.id,
          threecx_meeting_id: metadata.meetingId || filename,
          meeting_name: metadata.meetingName || filename.replace(/\.\w+$/, ""),
          host_extension: metadata.hostExtension,
          original_filename: filename,
          file_size: size,
          storage_path: uploadedPath,
          mime_type: mimeType,
          has_video: isVideo,
          has_audio: true,
          recorded_at: metadata.timestamp?.toISOString() || new Date().toISOString(),
          meeting_started_at: metadata.timestamp?.toISOString(),
        });

        result.filesSynced++;
        logger.debug(`Synced meeting recording via SFTP`, { tenantId: tenant.id, filename });
      } catch (error) {
        const err = handleError(error);
        result.errors.push({ filename, error: err.message });
        logger.error("Failed to sync meeting recording file", {
          tenantId: tenant.id,
          filename,
          error: err.message,
        });
      }
    }

    await updateSyncStatus("meetings", "success", {
      recordsSynced: result.filesSynced,
      tenantId: tenant.id,
    });

    logger.info("Meetings sync completed", {
      tenantId: tenant.id,
      synced: result.filesSynced,
      skipped: result.filesSkipped,
      errors: result.errors.length,
    });

    return result;
  } catch (error) {
    const err = handleError(error);
    logger.error("Meetings sync failed", { tenantId: tenant.id, error: err.message });
    await updateSyncStatus("meetings", "error", {
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
