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
import { insertMeetingRecording, updateSyncStatus } from "../storage/supabase";
import { TenantConfig } from "../storage/supabase";

export interface MeetingsSyncResult {
  filesSynced: number;
  filesSkipped: number;
  errors: Array<{ filename: string; error: string }>;
}

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

// Get list of meeting recording files from 3CX directory
function getMeetingFiles(meetingsPath: string): string[] {
  try {
    if (!fs.existsSync(meetingsPath)) {
      logger.warn("Meetings directory does not exist", { path: meetingsPath });
      return [];
    }

    const files: string[] = [];

    // Recursively find all video/audio files
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          // Meeting recordings can be MP4 video or audio-only formats
          if ([".mp4", ".webm", ".mkv", ".avi", ".mov", ".wav", ".mp3", ".ogg"].includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }

    scanDir(meetingsPath);
    logger.debug(`Found ${files.length} meeting recording files`);
    return files;
  } catch (error) {
    logger.error("Failed to read meetings directory", {
      error: (error as Error).message,
    });
    return [];
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
    return result;
  }

  if (!tenant.threecx_meetings_path) {
    logger.info("No meetings path configured for tenant", { tenantId: tenant.id });
    return result;
  }

  try {
    await updateSyncStatus("meetings", "running", { tenantId: tenant.id });

    const files = getMeetingFiles(tenant.threecx_meetings_path);

    if (files.length === 0) {
      logger.info("No meeting recording files to sync", { tenantId: tenant.id });
      await updateSyncStatus("meetings", "success", { recordsSynced: 0, tenantId: tenant.id });
      return result;
    }

    logger.info(`Processing ${files.length} meeting recording files`, { tenantId: tenant.id });

    for (const filePath of files) {
      try {
        const filename = path.basename(filePath);
        const stat = fs.statSync(filePath);

        // Get file info
        const { mimeType } = getFileInfo(filename);
        const metadata = parseMeetingFilename(filename);

        // Generate storage path
        const storagePath = generateStoragePath(tenant.id, "meetings", filename);

        // Check if already uploaded
        const exists = await fileExists(storagePath);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        // Determine if it's video or audio only
        const ext = path.extname(filename).toLowerCase();
        const isVideo = [".mp4", ".webm", ".mkv", ".avi", ".mov"].includes(ext);

        // Upload to Supabase Storage
        const uploadResult = await uploadFile(filePath, storagePath, mimeType);

        // Record in database
        await insertMeetingRecording({
          tenant_id: tenant.id,
          threecx_meeting_id: metadata.meetingId || filename,
          meeting_name: metadata.meetingName || filename.replace(/\.\w+$/, ""),
          host_extension: metadata.hostExtension,
          original_filename: filename,
          file_size: uploadResult.size,
          storage_path: uploadResult.path,
          mime_type: mimeType,
          has_video: isVideo,
          has_audio: true,
          recorded_at: metadata.timestamp?.toISOString() || new Date(stat.mtime).toISOString(),
          meeting_started_at: metadata.timestamp?.toISOString(),
        });

        result.filesSynced++;
        logger.debug(`Synced meeting recording`, { tenantId: tenant.id, filename });
      } catch (error) {
        const err = handleError(error);
        result.errors.push({
          filename: filePath,
          error: err.message,
        });
        logger.error("Failed to sync meeting recording file", {
          tenantId: tenant.id,
          filePath,
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
  }
}
