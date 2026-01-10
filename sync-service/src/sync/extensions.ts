import { Pool } from "pg";
import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import { getExtensions } from "../threecx/queries";
import { upsertExtension, updateSyncStatus } from "../storage/supabase";

export interface ExtensionSyncResult {
  extensionsSynced: number;
  errors: Array<{ extension: string; error: string }>;
}

export async function syncExtensions(
  pool?: Pool,
  tenantId?: string
): Promise<ExtensionSyncResult> {
  const result: ExtensionSyncResult = {
    extensionsSynced: 0,
    errors: [],
  };

  try {
    await updateSyncStatus("extensions", "running", { tenantId });

    logger.info("Starting extension sync", { tenantId });

    // Fetch extensions from 3CX
    const extensions = await getExtensions(pool);

    if (extensions.length === 0) {
      logger.info("No extensions found", { tenantId });
      await updateSyncStatus("extensions", "success", { recordsSynced: 0, tenantId });
      return result;
    }

    logger.info(`Processing ${extensions.length} extensions`, { tenantId });

    for (const ext of extensions) {
      try {
        await upsertExtension({
          extension_number: ext.extension_number,
          first_name: ext.firstname,
          last_name: ext.lastname,
          email: ext.email || null,
          tenant_id: tenantId,
        });

        result.extensionsSynced++;
      } catch (error) {
        const err = handleError(error);
        result.errors.push({
          extension: ext.extension_number,
          error: err.message,
        });
        logger.error("Failed to sync extension", {
          tenantId,
          extension: ext.extension_number,
          error: err.message,
        });
      }
    }

    await updateSyncStatus("extensions", "success", {
      recordsSynced: result.extensionsSynced,
      tenantId,
    });

    logger.info("Extension sync completed", {
      tenantId,
      synced: result.extensionsSynced,
      errors: result.errors.length,
    });

    return result;
  } catch (error) {
    const err = handleError(error);
    logger.error("Extension sync failed", { tenantId, error: err.message });
    await updateSyncStatus("extensions", "error", {
      errorMessage: err.message,
      tenantId,
    });
    throw err;
  }
}
