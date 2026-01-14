import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import { syncMessages, MessageSyncResult } from "./messages";
import { syncMedia, syncRecordings, syncVoicemails, MediaSyncResult } from "./media";
import { syncExtensions, ExtensionSyncResult } from "./extensions";
import { syncFaxes, FaxesSyncResult } from "./faxes";
import { syncMeetings, MeetingsSyncResult } from "./meetings";
import { syncCdr, CdrSyncResult } from "./cdr";
import { createSyncLog, updateSyncLog } from "../storage/supabase";
import { TenantConfig, getActiveTenants, getTenantPool, testTenantConnection } from "../tenant";

// Global timeout for entire tenant sync operation (10 minutes)
const TENANT_SYNC_TIMEOUT_MS = 10 * 60 * 1000;

// Timeout wrapper for async operations
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs / 1000}s`)), timeoutMs)
    ),
  ]);
}

export interface SyncResult {
  messages: MessageSyncResult;
  media: MediaSyncResult;
  recordings: MediaSyncResult;
  voicemails: MediaSyncResult;
  faxes: FaxesSyncResult;
  meetings: MeetingsSyncResult;
  cdr: CdrSyncResult;
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

// Run sync for a single tenant
export async function runTenantSync(
  tenant: TenantConfig,
  options?: {
    skipMedia?: boolean;
    skipExtensions?: boolean;
    batchSize?: number;
  }
): Promise<SyncResult> {
  const startTime = Date.now();
  const batchSize = options?.batchSize || 100;

  logger.info(`Starting sync for tenant: ${tenant.name}`, { tenantId: tenant.id });

  // Create sync log
  const logId = await createSyncLog({
    sync_type: "full",
    started_at: new Date().toISOString(),
    tenant_id: tenant.id,
  });

  const result: SyncResult = {
    messages: { messagesSynced: 0, conversationsCreated: 0, errors: [] },
    media: { filesSynced: 0, filesSkipped: 0, errors: [] },
    recordings: { filesSynced: 0, filesSkipped: 0, errors: [] },
    voicemails: { filesSynced: 0, filesSkipped: 0, errors: [] },
    faxes: { filesSynced: 0, filesSkipped: 0, errors: [] },
    meetings: { filesSynced: 0, filesSkipped: 0, errors: [] },
    cdr: { recordsSynced: 0, recordsSkipped: 0, errors: [] },
    extensions: { extensionsSynced: 0, errors: [] },
    duration: 0,
  };

  try {
    // Get database pool for this tenant (via SSH tunnel)
    const pool = await getTenantPool(tenant);
    if (!pool) {
      throw new Error("Failed to create database connection pool via SSH tunnel");
    }

    // Sync messages (database data - works remotely)
    if (tenant.backup_chats) {
      result.messages = await syncMessages(batchSize, pool, tenant.id);
    }

    // Sync CDR (call detail records from database)
    if (tenant.backup_cdr) {
      try {
        result.cdr = await syncCdr(pool, tenant.id);
      } catch (err) {
        logger.warn("CDR sync failed, continuing", { error: (err as Error).message });
      }
    }

    // Sync media files via SFTP (only if not skipped and tenant has SFTP configured)
    if (!options?.skipMedia) {
      try {
        result.media = await syncMedia(tenant);
      } catch (err) {
        logger.warn("Media sync failed, continuing", { error: (err as Error).message });
      }

      try {
        result.recordings = await syncRecordings(tenant);
      } catch (err) {
        logger.warn("Recordings sync failed, continuing", { error: (err as Error).message });
      }

      try {
        result.voicemails = await syncVoicemails(tenant);
      } catch (err) {
        logger.warn("Voicemails sync failed, continuing", { error: (err as Error).message });
      }

      try {
        result.faxes = await syncFaxes(tenant);
      } catch (err) {
        logger.warn("Faxes sync failed, continuing", { error: (err as Error).message });
      }

      try {
        result.meetings = await syncMeetings(tenant);
      } catch (err) {
        logger.warn("Meetings sync failed, continuing", { error: (err as Error).message });
      }
    }

    // Sync extensions
    if (!options?.skipExtensions) {
      result.extensions = await syncExtensions(pool, tenant.id);
    }

    result.duration = Date.now() - startTime;

    // Update sync log
    await updateSyncLog(logId, {
      completed_at: new Date().toISOString(),
      status: "success",
      messages_synced: result.messages.messagesSynced,
      media_synced: result.media.filesSynced + result.recordings.filesSynced + result.voicemails.filesSynced + result.faxes.filesSynced + result.meetings.filesSynced,
      errors_count:
        result.messages.errors.length +
        result.media.errors.length +
        result.recordings.errors.length +
        result.voicemails.errors.length +
        result.faxes.errors.length +
        result.meetings.errors.length +
        result.cdr.errors.length +
        result.extensions.errors.length,
    });

    logger.info(`Sync completed for tenant: ${tenant.name}`, {
      tenantId: tenant.id,
      messagesSynced: result.messages.messagesSynced,
      mediaSynced: result.media.filesSynced,
      recordingsSynced: result.recordings.filesSynced,
      voicemailsSynced: result.voicemails.filesSynced,
      faxesSynced: result.faxes.filesSynced,
      meetingsSynced: result.meetings.filesSynced,
      cdrSynced: result.cdr.recordsSynced,
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

// Sync all active tenants - MAIN ENTRY POINT for centralized service
export async function runMultiTenantSync(options?: {
  skipMedia?: boolean;
  skipExtensions?: boolean;
  batchSize?: number;
}): Promise<MultiTenantSyncResult> {
  const startTime = Date.now();
  const results: TenantSyncResult[] = [];

  logger.info("=== Starting centralized multi-tenant sync ===");

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
      recordings: { filesSynced: 0, filesSkipped: 0, errors: [] },
      voicemails: { filesSynced: 0, filesSkipped: 0, errors: [] },
      faxes: { filesSynced: 0, filesSkipped: 0, errors: [] },
      meetings: { filesSynced: 0, filesSkipped: 0, errors: [] },
      cdr: { recordsSynced: 0, recordsSkipped: 0, errors: [] },
      extensions: { extensionsSynced: 0, errors: [] },
      duration: 0,
    };

    try {
      // Test remote connection first (with 30s timeout)
      const connected = await withTimeout(
        testTenantConnection(tenant),
        30000,
        `Connection test for ${tenant.name}`
      );
      if (!connected) {
        tenantResult.error = `Failed to connect to 3CX database at ${tenant.threecx_host}`;
        results.push(tenantResult);
        continue;
      }

      // Run sync for this tenant (with global timeout)
      const syncResult = await withTimeout(
        runTenantSync(tenant, options),
        TENANT_SYNC_TIMEOUT_MS,
        `Sync for tenant ${tenant.name}`
      );

      tenantResult.messages = syncResult.messages;
      tenantResult.media = syncResult.media;
      tenantResult.recordings = syncResult.recordings;
      tenantResult.voicemails = syncResult.voicemails;
      tenantResult.faxes = syncResult.faxes;
      tenantResult.meetings = syncResult.meetings;
      tenantResult.cdr = syncResult.cdr;
      tenantResult.extensions = syncResult.extensions;
      tenantResult.duration = syncResult.duration;
      tenantResult.success = true;
    } catch (error) {
      const err = error as Error;
      tenantResult.error = err.message;
      logger.error(`Sync failed for tenant: ${tenant.name}`, {
        tenantId: tenant.id,
        error: err.message,
      });
    }

    results.push(tenantResult);
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  logger.info("=== Multi-tenant sync completed ===", {
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
