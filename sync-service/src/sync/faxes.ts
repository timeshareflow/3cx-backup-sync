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
import { insertFax, updateSyncStatus } from "../storage/supabase";
import { TenantConfig } from "../storage/supabase";

export interface FaxesSyncResult {
  filesSynced: number;
  filesSkipped: number;
  errors: Array<{ filename: string; error: string }>;
}

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

// Get list of fax files from 3CX directory
function getFaxFiles(faxPath: string): string[] {
  try {
    if (!fs.existsSync(faxPath)) {
      logger.warn("Fax directory does not exist", { path: faxPath });
      return [];
    }

    const files: string[] = [];

    // Recursively find all fax files (PDF, TIFF)
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if ([".pdf", ".tiff", ".tif"].includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }

    scanDir(faxPath);
    logger.debug(`Found ${files.length} fax files`);
    return files;
  } catch (error) {
    logger.error("Failed to read fax directory", {
      error: (error as Error).message,
    });
    return [];
  }
}

export async function syncFaxes(tenant: TenantConfig): Promise<FaxesSyncResult> {
  const result: FaxesSyncResult = {
    filesSynced: 0,
    filesSkipped: 0,
    errors: [],
  };

  if (!tenant.backup_faxes) {
    logger.info("Fax backup disabled for tenant", { tenantId: tenant.id });
    return result;
  }

  try {
    await updateSyncStatus("faxes", "running", { tenantId: tenant.id });

    const files = getFaxFiles(tenant.threecx_fax_path);

    if (files.length === 0) {
      logger.info("No fax files to sync", { tenantId: tenant.id });
      await updateSyncStatus("faxes", "success", { recordsSynced: 0, tenantId: tenant.id });
      return result;
    }

    logger.info(`Processing ${files.length} fax files`, { tenantId: tenant.id });

    for (const filePath of files) {
      try {
        const filename = path.basename(filePath);
        const stat = fs.statSync(filePath);

        // Get file info
        const { mimeType } = getFileInfo(filename);
        const metadata = parseFaxFilename(filename);

        // Generate storage path
        const storagePath = generateStoragePath(tenant.id, "faxes", filename);

        // Check if already uploaded
        const exists = await fileExists(storagePath);
        if (exists) {
          result.filesSkipped++;
          continue;
        }

        // Upload to Supabase Storage
        const uploadResult = await uploadFile(filePath, storagePath, mimeType);

        // Record in database
        await insertFax({
          tenant_id: tenant.id,
          threecx_fax_id: filename,
          direction: metadata.direction,
          remote_number: metadata.remoteNumber,
          original_filename: filename,
          file_size: uploadResult.size,
          storage_path: uploadResult.path,
          mime_type: mimeType,
          fax_time: metadata.timestamp?.toISOString() || new Date(stat.mtime).toISOString(),
        });

        result.filesSynced++;
        logger.debug(`Synced fax`, { tenantId: tenant.id, filename });
      } catch (error) {
        const err = handleError(error);
        result.errors.push({
          filename: filePath,
          error: err.message,
        });
        logger.error("Failed to sync fax file", {
          tenantId: tenant.id,
          filePath,
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
  }
}
