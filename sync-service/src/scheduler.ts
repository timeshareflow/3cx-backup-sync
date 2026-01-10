import cron from "node-cron";
import { logger } from "./utils/logger";
import { runQuickSync, runFullSync, runMultiTenantSync } from "./sync";
import { getLegacyPool } from "./tenant";

let isRunning = false;
let syncTask: cron.ScheduledTask | null = null;

// Check if we're in multi-tenant mode
function isMultiTenantMode(): boolean {
  return process.env.MULTI_TENANT_MODE === "true";
}

export function startScheduler(): void {
  const intervalSeconds = parseInt(process.env.SYNC_INTERVAL_SECONDS || "60");

  // Convert seconds to cron expression
  // For intervals less than 60 seconds, we use a different approach
  let cronExpression: string;

  if (intervalSeconds < 60) {
    // Run every minute and check internally
    cronExpression = "* * * * *";
  } else {
    const minutes = Math.floor(intervalSeconds / 60);
    cronExpression = `*/${minutes} * * * *`;
  }

  const mode = isMultiTenantMode() ? "multi-tenant" : "single-tenant";
  logger.info(`Starting scheduler in ${mode} mode with ${intervalSeconds}s interval`, {
    cronExpression,
    mode,
  });

  syncTask = cron.schedule(cronExpression, async () => {
    if (isRunning) {
      logger.warn("Previous sync still running, skipping this cycle");
      return;
    }

    isRunning = true;

    try {
      if (isMultiTenantMode()) {
        // Multi-tenant mode: sync all active tenants
        const now = new Date();

        // Every 10 cycles, do a full sync including media and extensions
        if (now.getMinutes() % 10 === 0) {
          logger.info("Running periodic full multi-tenant sync");
          await runMultiTenantSync({ skipMedia: false, skipExtensions: false });
        } else {
          // Quick sync - messages only
          await runMultiTenantSync({ skipMedia: true, skipExtensions: true });
        }
      } else {
        // Legacy single-tenant mode
        const pool = getLegacyPool();

        // Run quick sync (messages only) every interval
        await runQuickSync(undefined, pool);

        // Run full sync (including media and extensions) less frequently
        // Every 10 cycles, do a full sync
        const now = new Date();
        if (now.getMinutes() % 10 === 0) {
          logger.info("Running periodic full sync");
          await runFullSync({ skipMedia: false, skipExtensions: false, pool });
        }
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
