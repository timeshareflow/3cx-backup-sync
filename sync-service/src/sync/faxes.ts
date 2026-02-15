import * as path from "path";
import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import {
  uploadFileBuffer,
  generateStoragePath,
  fileExists,
  detectFileType,
} from "../storage/spaces-storage";
import { insertFax, updateSyncStatus } from "../storage/supabase";
import { createSftpClient, listRemoteFiles, closeSftpClient, downloadFile } from "../storage/sftp";
import { TenantConfig, getTenantSftpConfig } from "../tenant";

export interface FaxesSyncResult {
  filesSynced: number;
  filesSkipped: number;
  errors: Array<{ filename: string; error: string }>;
}

// Common 3CX fax paths to try
const FAX_PATHS = [
  "/var/lib/3cxpbx/Instance1/Data/Fax",
  "/var/lib/3cxpbx/Data/Fax",
  "/home/phonesystem/.3CXPhone System/Data/Fax",
];

// Parse fax filename to extract metadata
function parseFaxFilename(filename: string): {
  extension?: string;
  timestamp?: Date;
  direction?: "inbound" | "outbound";
  remoteNumber?: string;
} {
  const result: {
    extension?: string;
    timestamp?: Date;
    direction?: "inbound" | "outbound";
    remoteNumber?: string;
  } = {};

  // Detect direction from filename or folder
  if (filename.toLowerCase().includes("in") || filename.toLowerCase().includes("recv")) {
    result.direction = "inbound";
  } else if (filename.toLowerCase().includes("out") || filename.toLowerCase().includes("sent")) {
    result.direction = "outbound";
  }

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

  // Try to extract phone number
  const phoneMatch = filename.match(/(\+?\d{10,15})/);
  if (phoneMatch) {
    result.remoteNumber = phoneMatch[1];
  }

  return result;
}

export async function syncFaxes(tenant: TenantConfig): Promise<FaxesSyncResult> {
  const result: FaxesSyncResult = {
    filesSynced: 0,
    filesSkipped: 0,
    errors: [],
  };

  if (!tenant.backup_faxes) {
    logger.info("Fax backup disabled for tenant", { tenantId: tenant.id });
    await updateSyncStatus("faxes", "success", {
      recordsSynced: 0,
      notes: "Faxes backup disabled",
      tenantId: tenant.id,
    });
    return result;
  }

  const sftpConfig = getTenantSftpConfig(tenant);
  if (!sftpConfig) {
    logger.info("No SFTP credentials configured - skipping fax sync", { tenantId: tenant.id });
    await updateSyncStatus("faxes", "success", {
      recordsSynced: 0,
      notes: "No SFTP credentials configured - fax sync skipped",
      tenantId: tenant.id,
    });
    return result;
  }

  // Build list of paths to try - custom path first if configured
  const pathsToTry = tenant.threecx_fax_path
    ? [tenant.threecx_fax_path, ...FAX_PATHS]
    : FAX_PATHS;

  let sftp;
  try {
    await updateSyncStatus("faxes", "running", { tenantId: tenant.id });

    sftp = await createSftpClient(sftpConfig);

    // Try each path until we find one that exists
    let faxPath: string | null = null;
    let files: string[] = [];

    for (const tryPath of pathsToTry) {
      logger.debug("Trying fax path", { tenantId: tenant.id, path: tryPath });
      try {
        files = await listRemoteFiles(sftp, tryPath);
        // Filter to only PDF and TIFF files
        files = files.filter(f => {
          const ext = path.extname(f).toLowerCase();
          return [".pdf", ".tiff", ".tif"].includes(ext);
        });
        if (files.length > 0) {
          faxPath = tryPath;
          logger.info("Found fax directory", { tenantId: tenant.id, path: tryPath, fileCount: files.length });
          break;
        }
      } catch {
        // Path doesn't exist, try next
        continue;
      }
    }

    if (files.length === 0 || !faxPath) {
      const notes = `No fax files found. Checked: ${pathsToTry.join(", ")}`;
      logger.info("No fax files found on remote server", { tenantId: tenant.id, pathsTried: pathsToTry });
      await updateSyncStatus("faxes", "success", { recordsSynced: 0, notes, tenantId: tenant.id });
      return result;
    }

    logger.info(`Found ${files.length} fax files to process`, { tenantId: tenant.id });

    for (const filename of files) {
      try {
        const remotePath = path.posix.join(faxPath, filename);
        const buffer = await downloadFile(sftp, remotePath);
        const { mimeType, extension } = detectFileType(buffer);
        const metadata = parseFaxFilename(filename);

        const storagePath = generateStoragePath(tenant.id, "faxes", filename, extension);

        const exists = await fileExists(storagePath);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        const { path: uploadedPath, size } = await uploadFileBuffer(buffer, storagePath, mimeType);

        await insertFax({
          tenant_id: tenant.id,
          threecx_fax_id: filename,
          direction: metadata.direction,
          remote_number: metadata.remoteNumber,
          original_filename: filename,
          file_size: size,
          storage_path: uploadedPath,
          mime_type: mimeType,
          fax_time: metadata.timestamp?.toISOString() || new Date().toISOString(),
          storage_backend: "spaces",
        });

        result.filesSynced++;
        logger.debug(`Synced fax via SFTP`, { tenantId: tenant.id, filename });
      } catch (error) {
        const err = handleError(error);
        result.errors.push({ filename, error: err.message });
        logger.error("Failed to sync fax file", {
          tenantId: tenant.id,
          filename,
          error: err.message,
        });
      }
    }

    await updateSyncStatus("faxes", "success", {
      recordsSynced: result.filesSynced,
      tenantId: tenant.id,
    });

    logger.info("Faxes sync completed", {
      tenantId: tenant.id,
      synced: result.filesSynced,
      skipped: result.filesSkipped,
      errors: result.errors.length,
    });

    return result;
  } catch (error) {
    const err = handleError(error);
    logger.error("Faxes sync failed", { tenantId: tenant.id, error: err.message });
    await updateSyncStatus("faxes", "error", {
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
