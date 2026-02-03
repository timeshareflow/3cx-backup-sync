import { Pool } from "pg";
import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import { getExtensions } from "../threecx/queries";
import { upsertExtension, updateSyncStatus, cascadeExtensionNameChange } from "../storage/supabase";

export interface ExtensionSyncResult {
  extensionsSynced: number;
  namesChanged: number;
  errors: Array<{ extension: string; error: string }>;
}

export async function syncExtensions(
  pool?: Pool,
  tenantId?: string
): Promise<ExtensionSyncResult> {
  const result: ExtensionSyncResult = {
    extensionsSynced: 0,
    namesChanged: 0,
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
        const displayName =
          [ext.firstname, ext.lastname].filter(Boolean).join(" ") || null;

        const { changed, extensionId } = await upsertExtension({
          extension_number: ext.extension_number,
          first_name: ext.firstname,
          last_name: ext.lastname,
          email: ext.email || null,
          tenant_id: tenantId,
        });

        result.extensionsSynced++;

        // If extension name changed, cascade to all participants and conversations
        if (changed && extensionId && displayName) {
          const cascade = await cascadeExtensionNameChange(
            extensionId,
            displayName,
            ext.extension_number
          );
          if (cascade.participantsUpdated > 0) {
            result.namesChanged++;
            logger.info("Extension name change cascaded", {
              extensionNumber: ext.extension_number,
              newName: displayName,
              participantsUpdated: cascade.participantsUpdated,
              conversationsUpdated: cascade.conversationsUpdated,
            });
          }
        }
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

    let notes = `Synced ${result.extensionsSynced} extensions`;
    if (result.namesChanged > 0) {
      notes += `, ${result.namesChanged} name changes cascaded`;
    }

    await updateSyncStatus("extensions", "success", {
      recordsSynced: result.extensionsSynced,
      notes,
      tenantId,
    });

    logger.info("Extension sync completed", {
      tenantId,
      synced: result.extensionsSynced,
      namesChanged: result.namesChanged,
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
