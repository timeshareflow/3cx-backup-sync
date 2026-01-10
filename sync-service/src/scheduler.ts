import cron from "node-cron";
import { logger } from "./utils/logger";
import { runMultiTenantSync } from "./sync";

let isRunning = false;
let syncTask: cron.ScheduledTask | null = null;
let cycleCount = 0;

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
      // Every 10 cycles, do a full sync including media and extensions
      // Otherwise, quick sync (messages/CDR only)
      const isFullSync = cycleCount % 10 === 0;

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
