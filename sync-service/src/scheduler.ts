import cron from "node-cron";
import { logger } from "./utils/logger";
import { runMultiTenantSync } from "./sync";
import { getSupabaseClient } from "./storage/supabase";

let isRunning = false;
let syncTask: cron.ScheduledTask | null = null;
let cycleCount = 0;

// Check if any tenant has requested a manual sync trigger
async function checkForManualTriggers(): Promise<boolean> {
  const supabase = getSupabaseClient();
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("sync_status")
    .select("tenant_id, trigger_requested_at")
    .gt("trigger_requested_at", twoMinutesAgo)
    .limit(1);

  if (error) {
    logger.warn("Failed to check for manual triggers", { error: error.message });
    return false;
  }

  return data && data.length > 0;
}

// Clear the trigger after processing
async function clearManualTriggers(): Promise<void> {
  const supabase = getSupabaseClient();
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  await supabase
    .from("sync_status")
    .update({ trigger_requested_at: null })
    .gt("trigger_requested_at", twoMinutesAgo);
}

export function startScheduler(): void {
  const intervalSeconds = parseInt(process.env.SYNC_INTERVAL_SECONDS || "60");

  // Convert seconds to cron expression
  let cronExpression: string;

  if (intervalSeconds < 60) {
    // Run every minute for sub-minute intervals
    cronExpression = "* * * * *";
  } else {
    const minutes = Math.floor(intervalSeconds / 60);
    cronExpression = `*/${minutes} * * * *`;
  }

  logger.info(`Starting scheduler with ${intervalSeconds}s interval`, {
    cronExpression,
  });

  syncTask = cron.schedule(cronExpression, async () => {
    if (isRunning) {
      logger.warn("Previous sync still running, skipping this cycle");
      return;
    }

    isRunning = true;
    cycleCount++;

    try {
      // Check for manual trigger requests first
      const hasManualTrigger = await checkForManualTriggers();

      // Every 10 cycles, do a full sync including media and extensions
      // Manual triggers also force a full sync
      const isFullSync = cycleCount % 10 === 0 || hasManualTrigger;

      if (hasManualTrigger) {
        logger.info("Manual sync triggered - running full sync");
        await clearManualTriggers();
      }

      if (isFullSync) {
        logger.info("Running full sync (including media)");
        await runMultiTenantSync({ skipMedia: false, skipExtensions: false });
      } else {
        logger.debug("Running quick sync (messages only)");
        await runMultiTenantSync({ skipMedia: true, skipExtensions: true });
      }
    } catch (error) {
      logger.error("Scheduled sync failed", {
        error: (error as Error).message,
      });
    } finally {
      isRunning = false;
    }
  });

  syncTask.start();
  logger.info("Scheduler started");
}

export function stopScheduler(): void {
  if (syncTask) {
    syncTask.stop();
    syncTask = null;
    logger.info("Scheduler stopped");
  }
}

export function isSchedulerRunning(): boolean {
  return syncTask !== null;
}

export function isSyncInProgress(): boolean {
  return isRunning;
}
