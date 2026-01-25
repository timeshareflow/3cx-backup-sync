import cron from "node-cron";
import { logger } from "./utils/logger";
import { runMultiTenantSync } from "./sync";
import { getSupabaseClient } from "./storage/supabase";
import { getActiveUserTenants, getInactiveTenants } from "./tenant";

let isRunning = false;
let activeUserSyncTask: cron.ScheduledTask | null = null;
let backgroundSyncTask: cron.ScheduledTask | null = null;
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

// Run sync for tenants with active users (every minute)
async function runActiveUserSync(): Promise<void> {
  if (isRunning) {
    logger.debug("Sync already running, skipping active user sync");
    return;
  }

  try {
    const activeTenants = await getActiveUserTenants();

    if (activeTenants.length === 0) {
      logger.debug("No tenants with active users");
      return;
    }

    isRunning = true;
    cycleCount++;

    logger.info(`Running sync for ${activeTenants.length} tenant(s) with active users`);

    // Check for manual triggers
    const hasManualTrigger = await checkForManualTriggers();
    if (hasManualTrigger) {
      logger.info("Manual sync triggered");
      await clearManualTriggers();
    }

    // Every 10 cycles, do a full sync; otherwise quick sync
    const isFullSync = cycleCount % 10 === 0 || hasManualTrigger;

    await runMultiTenantSync({
      skipMedia: !isFullSync,
      skipExtensions: !isFullSync,
      tenantIds: activeTenants.map((t) => t.id),
    });
  } catch (error) {
    logger.error("Active user sync failed", { error: (error as Error).message });
  } finally {
    isRunning = false;
  }
}

// Run sync for inactive tenants (every 15 minutes)
async function runBackgroundSync(): Promise<void> {
  if (isRunning) {
    logger.debug("Sync already running, skipping background sync");
    return;
  }

  try {
    const inactiveTenants = await getInactiveTenants();

    if (inactiveTenants.length === 0) {
      logger.debug("No inactive tenants to sync");
      return;
    }

    isRunning = true;

    logger.info(`Running background sync for ${inactiveTenants.length} inactive tenant(s)`);

    // Background sync is always a quick sync
    await runMultiTenantSync({
      skipMedia: true,
      skipExtensions: true,
      tenantIds: inactiveTenants.map((t) => t.id),
    });
  } catch (error) {
    logger.error("Background sync failed", { error: (error as Error).message });
  } finally {
    isRunning = false;
  }
}

export function startScheduler(): void {
  const activeIntervalSeconds = parseInt(process.env.SYNC_INTERVAL_ACTIVE || "60");
  const backgroundIntervalMinutes = parseInt(process.env.SYNC_INTERVAL_BACKGROUND || "15");

  logger.info("Starting dynamic scheduler", {
    activeInterval: `${activeIntervalSeconds}s (for tenants with active users)`,
    backgroundInterval: `${backgroundIntervalMinutes}m (for inactive tenants)`,
  });

  // Active user sync: every minute (or configured interval)
  activeUserSyncTask = cron.schedule("* * * * *", runActiveUserSync);
  activeUserSyncTask.start();

  // Background sync: every 15 minutes (or configured interval)
  backgroundSyncTask = cron.schedule(`*/${backgroundIntervalMinutes} * * * *`, runBackgroundSync);
  backgroundSyncTask.start();

  logger.info("Dynamic scheduler started");
  logger.info("  - Active user tenants: sync every minute");
  logger.info("  - Inactive tenants: sync every 15 minutes");
}

export function stopScheduler(): void {
  if (activeUserSyncTask) {
    activeUserSyncTask.stop();
    activeUserSyncTask = null;
  }
  if (backgroundSyncTask) {
    backgroundSyncTask.stop();
    backgroundSyncTask = null;
  }
  logger.info("Scheduler stopped");
}

export function isSchedulerRunning(): boolean {
  return activeUserSyncTask !== null || backgroundSyncTask !== null;
}

export function isSyncInProgress(): boolean {
  return isRunning;
}
