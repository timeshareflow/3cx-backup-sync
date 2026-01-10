import { Pool } from "pg";
import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import { syncMessages, MessageSyncResult } from "./messages";
import { syncMedia, MediaSyncResult } from "./media";
import { syncExtensions, ExtensionSyncResult } from "./extensions";
import { createSyncLog, updateSyncLog } from "../storage/supabase";
import { TenantConfig, getActiveTenants, getTenantPool, testTenantConnection } from "../tenant";

export interface SyncResult {
  messages: MessageSyncResult;
  media: MediaSyncResult;
  extensions: ExtensionSyncResult;
  duration: number;
}

export interface TenantSyncResult extends SyncResult {
  tenantId: string;
  tenantName: string;
  success: boolean;
  error?: string;
}

export interface MultiTenantSyncResult {
  results: TenantSyncResult[];
  totalDuration: number;
  successCount: number;
  failureCount: number;
}

export async function runFullSync(options?: {
  skipMedia?: boolean;
  skipExtensions?: boolean;
  batchSize?: number;
  tenantId?: string; // Optional: sync specific tenant only
  pool?: Pool; // Optional: use provided pool (for legacy single-tenant mode)
}): Promise<SyncResult> {
  const startTime = Date.now();
  const batchSize = options?.batchSize || parseInt(process.env.SYNC_BATCH_SIZE || "100");

  logger.info("Starting full sync", { options });

  // Create sync log
  const logId = await createSyncLog({
    sync_type: "full",
    started_at: new Date().toISOString(),
    tenant_id: options?.tenantId,
  });

  const result: SyncResult = {
    messages: { messagesSynced: 0, conversationsCreated: 0, errors: [] },
    media: { filesSynced: 0, filesSkipped: 0, errors: [] },
    extensions: { extensionsSynced: 0, errors: [] },
    duration: 0,
  };

  try {
    // Sync messages
    result.messages = await syncMessages(batchSize, options?.pool, options?.tenantId);

    // Sync media (optional)
    if (!options?.skipMedia) {
      result.media = await syncMedia(options?.tenantId);
    }

    // Sync extensions (optional, less frequent)
    if (!options?.skipExtensions) {
      result.extensions = await syncExtensions(options?.pool, options?.tenantId);
    }

    result.duration = Date.now() - startTime;

    // Update sync log
    await updateSyncLog(logId, {
      completed_at: new Date().toISOString(),
      status: "success",
      messages_synced: result.messages.messagesSynced,
      media_synced: result.media.filesSynced,
      errors_count:
        result.messages.errors.length +
        result.media.errors.length +
        result.extensions.errors.length,
    });

    logger.info("Full sync completed", {
      tenantId: options?.tenantId,
      messagesSynced: result.messages.messagesSynced,
      mediaSynced: result.media.filesSynced,
      extensionsSynced: result.extensions.extensionsSynced,
      duration: `${result.duration}ms`,
    });

    return result;
  } catch (error) {
    const err = handleError(error);

    await updateSyncLog(logId, {
      completed_at: new Date().toISOString(),
      status: "error",
      messages_synced: result.messages.messagesSynced,
      media_synced: result.media.filesSynced,
      errors_count: 1,
      error_details: { message: err.message, code: err.code },
    });

    throw err;
  }
}

// Sync all active tenants
export async function runMultiTenantSync(options?: {
  skipMedia?: boolean;
  skipExtensions?: boolean;
  batchSize?: number;
}): Promise<MultiTenantSyncResult> {
  const startTime = Date.now();
  const results: TenantSyncResult[] = [];

  logger.info("Starting multi-tenant sync");

  // Get all active tenants with configured 3CX connections
  const tenants = await getActiveTenants();

  if (tenants.length === 0) {
    logger.warn("No active tenants with 3CX configuration found");
    return {
      results: [],
      totalDuration: Date.now() - startTime,
      successCount: 0,
      failureCount: 0,
    };
  }

  logger.info(`Found ${tenants.length} active tenants to sync`);

  // Sync each tenant
  for (const tenant of tenants) {
    const tenantResult: TenantSyncResult = {
      tenantId: tenant.id,
      tenantName: tenant.name,
      success: false,
      messages: { messagesSynced: 0, conversationsCreated: 0, errors: [] },
      media: { filesSynced: 0, filesSkipped: 0, errors: [] },
      extensions: { extensionsSynced: 0, errors: [] },
      duration: 0,
    };

    try {
      logger.info(`Starting sync for tenant: ${tenant.name}`, { tenantId: tenant.id });

      // Test connection first
      const connected = await testTenantConnection(tenant);
      if (!connected) {
        tenantResult.error = "Failed to connect to 3CX database";
        results.push(tenantResult);
        continue;
      }

      // Get tenant pool
      const pool = getTenantPool(tenant);
      if (!pool) {
        tenantResult.error = "Failed to create database pool";
        results.push(tenantResult);
        continue;
      }

      // Run sync for this tenant
      const syncResult = await runFullSync({
        ...options,
        tenantId: tenant.id,
        pool,
      });

      tenantResult.messages = syncResult.messages;
      tenantResult.media = syncResult.media;
      tenantResult.extensions = syncResult.extensions;
      tenantResult.duration = syncResult.duration;
      tenantResult.success = true;

      logger.info(`Completed sync for tenant: ${tenant.name}`, {
        tenantId: tenant.id,
        messagesSynced: syncResult.messages.messagesSynced,
      });
    } catch (error) {
      const err = error as Error;
      tenantResult.error = err.message;
      logger.error(`Failed sync for tenant: ${tenant.name}`, {
        tenantId: tenant.id,
        error: err.message,
      });
    }

    results.push(tenantResult);
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  logger.info("Multi-tenant sync completed", {
    totalTenants: tenants.length,
    successCount,
    failureCount,
    totalDuration: `${Date.now() - startTime}ms`,
  });

  return {
    results,
    totalDuration: Date.now() - startTime,
    successCount,
    failureCount,
  };
}

// Quick sync - messages only
export async function runQuickSync(
  batchSize?: number,
  pool?: Pool,
  tenantId?: string
): Promise<MessageSyncResult> {
  logger.info("Starting quick sync (messages only)", { tenantId });
  return syncMessages(
    batchSize || parseInt(process.env.SYNC_BATCH_SIZE || "100"),
    pool,
    tenantId
  );
}
