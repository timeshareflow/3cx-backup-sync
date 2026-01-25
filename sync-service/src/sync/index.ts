import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import { canExecute, recordSuccess, recordFailure, getAllCircuitStates, CircuitState } from "../utils/circuit-breaker";
import { syncMessages, MessageSyncResult } from "./messages";
import { syncMedia, syncVoicemails, MediaSyncResult } from "./media";
import { syncRecordings, RecordingsSyncResult } from "./recordings";
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
  recordings: RecordingsSyncResult;
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
  circuitState?: CircuitState;
  skippedByCircuitBreaker?: boolean;
}

export interface MultiTenantSyncResult {
  results: TenantSyncResult[];
  totalDuration: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  circuitStates: Record<string, { state: CircuitState; failures: number }>;
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
    recordings: { filesSynced: 0, filesSkipped: 0, errors: [] as Array<{ recordingId: string; error: string }> },
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
        result.recordings = await syncRecordings(tenant, pool);
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
  tenantIds?: string[]; // Optional filter for specific tenants
}): Promise<MultiTenantSyncResult> {
  const startTime = Date.now();
  const results: TenantSyncResult[] = [];

  logger.info("=== Starting centralized multi-tenant sync ===", {
    tenantFilter: options?.tenantIds?.length ? `${options.tenantIds.length} specific tenants` : "all active tenants",
  });

  // Get all active tenants with configured 3CX connections
  let tenants = await getActiveTenants();

  // Filter to specific tenants if provided
  if (options?.tenantIds && options.tenantIds.length > 0) {
    const tenantIdSet = new Set(options.tenantIds);
    tenants = tenants.filter((t) => tenantIdSet.has(t.id));
  }

  if (tenants.length === 0) {
    logger.warn("No active tenants with 3CX configuration found");
    return {
      results: [],
      totalDuration: Date.now() - startTime,
      successCount: 0,
      failureCount: 0,
      skippedCount: 0,
      circuitStates: {},
    };
  }

  logger.info(`Found ${tenants.length} active tenants to sync`);

  // Sync each tenant with circuit breaker protection
  for (const tenant of tenants) {
    const tenantResult: TenantSyncResult = {
      tenantId: tenant.id,
      tenantName: tenant.name,
      success: false,
      messages: { messagesSynced: 0, conversationsCreated: 0, errors: [] },
      media: { filesSynced: 0, filesSkipped: 0, errors: [] },
      recordings: { filesSynced: 0, filesSkipped: 0, errors: [] as Array<{ recordingId: string; error: string }> },
      voicemails: { filesSynced: 0, filesSkipped: 0, errors: [] },
      faxes: { filesSynced: 0, filesSkipped: 0, errors: [] },
      meetings: { filesSynced: 0, filesSkipped: 0, errors: [] },
      cdr: { recordsSynced: 0, recordsSkipped: 0, errors: [] },
      extensions: { extensionsSynced: 0, errors: [] },
      duration: 0,
    };

    // Check circuit breaker before attempting sync
    const circuitCheck = canExecute(tenant.id);
    tenantResult.circuitState = circuitCheck.state;

    if (!circuitCheck.allowed) {
      tenantResult.skippedByCircuitBreaker = true;
      tenantResult.error = circuitCheck.reason || "Circuit breaker open";
      logger.info(`Skipping sync for tenant ${tenant.name} - circuit breaker open`, {
        tenantId: tenant.id,
        state: circuitCheck.state,
        reason: circuitCheck.reason,
      });
      results.push(tenantResult);
      continue;
    }

    try {
      // Test remote connection first (with 30s timeout)
      const connected = await withTimeout(
        testTenantConnection(tenant),
        30000,
        `Connection test for ${tenant.name}`
      );
      if (!connected) {
        const errorMsg = `Failed to connect to 3CX database at ${tenant.threecx_host}`;
        tenantResult.error = errorMsg;
        recordFailure(tenant.id, errorMsg);
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

      // Record success with circuit breaker
      recordSuccess(tenant.id);
    } catch (error) {
      const err = error as Error;
      tenantResult.error = err.message;

      // Record failure with circuit breaker
      recordFailure(tenant.id, err.message);

      logger.error(`Sync failed for tenant: ${tenant.name}`, {
        tenantId: tenant.id,
        error: err.message,
      });
    }

    results.push(tenantResult);
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success && !r.skippedByCircuitBreaker).length;
  const skippedCount = results.filter((r) => r.skippedByCircuitBreaker).length;

  // Get all circuit breaker states for monitoring
  const allStates = getAllCircuitStates();
  const circuitStates: Record<string, { state: CircuitState; failures: number }> = {};
  for (const [tenantId, info] of Object.entries(allStates)) {
    circuitStates[tenantId] = { state: info.state, failures: info.failures };
  }

  logger.info("=== Multi-tenant sync completed ===", {
    totalTenants: tenants.length,
    successCount,
    failureCount,
    skippedCount,
    totalDuration: `${Date.now() - startTime}ms`,
    circuitBreakers: skippedCount > 0 ? circuitStates : undefined,
  });

  return {
    results,
    totalDuration: Date.now() - startTime,
    successCount,
    failureCount,
    skippedCount,
    circuitStates,
  };
}
