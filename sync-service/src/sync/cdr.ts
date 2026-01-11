import { Pool } from "pg";
import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import { getCallRecords } from "../threecx/queries";
import { insertCallLog, updateSyncStatus, getLastSyncedTimestamp } from "../storage/supabase";

export interface CdrSyncResult {
  recordsSynced: number;
  recordsSkipped: number;
  errors: Array<{ callId: string; error: string }>;
}

export async function syncCdr(
  pool: Pool,
  tenantId: string
): Promise<CdrSyncResult> {
  const result: CdrSyncResult = {
    recordsSynced: 0,
    recordsSkipped: 0,
    errors: [],
  };

  try {
    await updateSyncStatus("cdr", "running", { tenantId });

    // Get last sync timestamp to only fetch new records
    const lastSync = await getLastSyncedTimestamp("cdr", tenantId);
    const since = lastSync ? new Date(lastSync) : null;

    logger.info("Fetching CDR records from 3CX", {
      tenantId,
      since: since?.toISOString() || "beginning",
    });

    // Fetch CDR records from 3CX database
    const callRecords = await getCallRecords(since, 1000, pool);

    if (callRecords.length === 0) {
      logger.info("No new CDR records to sync", { tenantId });
      await updateSyncStatus("cdr", "success", { recordsSynced: 0, tenantId });
      return result;
    }

    logger.info(`Processing ${callRecords.length} CDR records`, { tenantId });

    for (const record of callRecords) {
      try {
        await insertCallLog({
          tenant_id: tenantId,
          threecx_call_id: record.call_id,
          caller_number: record.caller_number || undefined,
          caller_name: record.caller_name || undefined,
          callee_number: record.callee_number || undefined,
          callee_name: record.callee_name || undefined,
          extension: record.extension_number || undefined,
          direction: record.direction,
          call_type: record.call_type || undefined,
          status: record.status || undefined,
          ring_duration_seconds: record.ring_duration || undefined,
          talk_duration_seconds: record.talk_duration || undefined,
          total_duration_seconds: record.total_duration || undefined,
          call_started_at: new Date(record.call_started_at).toISOString(),
          call_answered_at: record.call_answered_at
            ? new Date(record.call_answered_at).toISOString()
            : undefined,
          call_ended_at: record.call_ended_at
            ? new Date(record.call_ended_at).toISOString()
            : undefined,
          has_recording: record.has_recording,
        });

        result.recordsSynced++;
      } catch (error) {
        const err = handleError(error);
        // Skip duplicates silently
        if (err.message.includes("duplicate") || err.message.includes("23505")) {
          result.recordsSkipped++;
          continue;
        }
        result.errors.push({
          callId: record.call_id,
          error: err.message,
        });
        logger.error("Failed to sync CDR record", {
          tenantId,
          callId: record.call_id,
          error: err.message,
        });
      }
    }

    await updateSyncStatus("cdr", "success", {
      recordsSynced: result.recordsSynced,
      tenantId,
    });

    logger.info("CDR sync completed", {
      tenantId,
      synced: result.recordsSynced,
      skipped: result.recordsSkipped,
      errors: result.errors.length,
    });

    return result;
  } catch (error) {
    const err = handleError(error);
    logger.error("CDR sync failed", { tenantId, error: err.message });
    await updateSyncStatus("cdr", "error", {
      errorMessage: err.message,
      tenantId,
    });
    throw err;
  }
}
