import cron from "node-cron";
import { logger } from "./utils/logger";
import { runMultiTenantSync, runMultiTenantSyncByType, SyncType } from "./sync";
import { getSupabaseClient } from "./storage/supabase";
import { getActiveUserTenants, getInactiveTenants } from "./tenant";

// Track which sync types are currently running
const runningSync: Set<SyncType | "full"> = new Set();

// Scheduled tasks
let chatSyncTask: cron.ScheduledTask | null = null;
let mediaSyncTask: cron.ScheduledTask | null = null;
let recordingsSyncTask: cron.ScheduledTask | null = null;
let cdrSyncTask: cron.ScheduledTask | null = null;
let extensionsSyncTask: cron.ScheduledTask | null = null;
let backgroundSyncTask: cron.ScheduledTask | null = null;

// Cycle counter for full syncs
let chatCycleCount = 0;

// Sync intervals (configurable via env)
const SYNC_INTERVALS = {
  chat: parseInt(process.env.SYNC_INTERVAL_CHAT || "20"), // seconds
  media: parseInt(process.env.SYNC_INTERVAL_MEDIA || "5"), // minutes
  recordings: parseInt(process.env.SYNC_INTERVAL_RECORDINGS || "15"), // minutes
  cdr: parseInt(process.env.SYNC_INTERVAL_CDR || "5"), // minutes
  extensions: parseInt(process.env.SYNC_INTERVAL_EXTENSIONS || "60"), // minutes
  background: parseInt(process.env.SYNC_INTERVAL_BACKGROUND || "15"), // minutes
};

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

// Run chat/messages sync (fast - every 15-30 seconds)
async function runChatSync(): Promise<void> {
  if (runningSync.has("messages") || runningSync.has("full")) {
    logger.debug("Chat sync skipped - already running");
    return;
  }

  try {
    const activeTenants = await getActiveUserTenants();
    if (activeTenants.length === 0) {
      return;
    }

    runningSync.add("messages");
    chatCycleCount++;

    // Check for manual triggers
    const hasManualTrigger = await checkForManualTriggers();
    if (hasManualTrigger) {
      logger.info("Manual sync triggered - running full sync");
      await clearManualTriggers();

      // Run full sync instead
      runningSync.delete("messages");
      runningSync.add("full");

      await runMultiTenantSync({
        tenantIds: activeTenants.map((t) => t.id),
      });

      runningSync.delete("full");
      return;
    }

    logger.debug(`Chat sync for ${activeTenants.length} tenant(s)`);

    await runMultiTenantSyncByType(
      ["messages"],
      activeTenants.map((t) => t.id)
    );
  } catch (error) {
    logger.error("Chat sync failed", { error: (error as Error).message });
  } finally {
    runningSync.delete("messages");
  }
}

// Run media sync (every 5 minutes)
async function runMediaSync(): Promise<void> {
  if (runningSync.has("media") || runningSync.has("full")) {
    logger.debug("Media sync skipped - already running");
    return;
  }

  try {
    const activeTenants = await getActiveUserTenants();
    if (activeTenants.length === 0) {
      return;
    }

    runningSync.add("media");

    logger.info(`Media sync for ${activeTenants.length} tenant(s)`);

    await runMultiTenantSyncByType(
      ["media", "voicemails"],
      activeTenants.map((t) => t.id)
    );
  } catch (error) {
    logger.error("Media sync failed", { error: (error as Error).message });
  } finally {
    runningSync.delete("media");
  }
}

// Run recordings sync (every 15 minutes)
async function runRecordingsSync(): Promise<void> {
  if (runningSync.has("recordings") || runningSync.has("full")) {
    logger.debug("Recordings sync skipped - already running");
    return;
  }

  try {
    const activeTenants = await getActiveUserTenants();
    if (activeTenants.length === 0) {
      return;
    }

    runningSync.add("recordings");

    logger.info(`Recordings sync for ${activeTenants.length} tenant(s)`);

    await runMultiTenantSyncByType(
      ["recordings", "meetings", "faxes"],
      activeTenants.map((t) => t.id)
    );
  } catch (error) {
    logger.error("Recordings sync failed", { error: (error as Error).message });
  } finally {
    runningSync.delete("recordings");
  }
}

// Run CDR sync (every 5 minutes)
async function runCdrSync(): Promise<void> {
  if (runningSync.has("cdr") || runningSync.has("full")) {
    logger.debug("CDR sync skipped - already running");
    return;
  }

  try {
    const activeTenants = await getActiveUserTenants();
    if (activeTenants.length === 0) {
      return;
    }

    runningSync.add("cdr");

    logger.debug(`CDR sync for ${activeTenants.length} tenant(s)`);

    await runMultiTenantSyncByType(
      ["cdr"],
      activeTenants.map((t) => t.id)
    );
  } catch (error) {
    logger.error("CDR sync failed", { error: (error as Error).message });
  } finally {
    runningSync.delete("cdr");
  }
}

// Run extensions sync (every hour)
async function runExtensionsSync(): Promise<void> {
  if (runningSync.has("extensions") || runningSync.has("full")) {
    logger.debug("Extensions sync skipped - already running");
    return;
  }

  try {
    const activeTenants = await getActiveUserTenants();
    if (activeTenants.length === 0) {
      return;
    }

    runningSync.add("extensions");

    logger.info(`Extensions sync for ${activeTenants.length} tenant(s)`);

    await runMultiTenantSyncByType(
      ["extensions"],
      activeTenants.map((t) => t.id)
    );
  } catch (error) {
    logger.error("Extensions sync failed", { error: (error as Error).message });
  } finally {
    runningSync.delete("extensions");
  }
}

// Run sync for inactive tenants (every 15 minutes - messages only)
async function runBackgroundSync(): Promise<void> {
  if (runningSync.size > 0) {
    logger.debug("Background sync skipped - other sync running");
    return;
  }

  try {
    const inactiveTenants = await getInactiveTenants();

    if (inactiveTenants.length === 0) {
      logger.debug("No inactive tenants to sync");
      return;
    }

    runningSync.add("full");

    logger.info(`Background sync for ${inactiveTenants.length} inactive tenant(s)`);

    // Background sync is messages only
    await runMultiTenantSyncByType(
      ["messages"],
      inactiveTenants.map((t) => t.id)
    );
  } catch (error) {
    logger.error("Background sync failed", { error: (error as Error).message });
  } finally {
    runningSync.delete("full");
  }
}

export function startScheduler(): void {
  logger.info("Starting multi-interval scheduler", {
    chatInterval: `${SYNC_INTERVALS.chat}s`,
    mediaInterval: `${SYNC_INTERVALS.media}m`,
    recordingsInterval: `${SYNC_INTERVALS.recordings}m`,
    cdrInterval: `${SYNC_INTERVALS.cdr}m`,
    extensionsInterval: `${SYNC_INTERVALS.extensions}m`,
    backgroundInterval: `${SYNC_INTERVALS.background}m`,
  });

  // Chat sync: every N seconds (use setInterval for sub-minute)
  const chatIntervalMs = SYNC_INTERVALS.chat * 1000;
  const chatIntervalId = setInterval(runChatSync, chatIntervalMs);
  chatSyncTask = {
    start: () => {},
    stop: () => clearInterval(chatIntervalId),
  } as cron.ScheduledTask;

  // Media sync: every N minutes
  mediaSyncTask = cron.schedule(`*/${SYNC_INTERVALS.media} * * * *`, runMediaSync);
  mediaSyncTask.start();

  // Recordings sync: every N minutes
  recordingsSyncTask = cron.schedule(`*/${SYNC_INTERVALS.recordings} * * * *`, runRecordingsSync);
  recordingsSyncTask.start();

  // CDR sync: every N minutes
  cdrSyncTask = cron.schedule(`*/${SYNC_INTERVALS.cdr} * * * *`, runCdrSync);
  cdrSyncTask.start();

  // Extensions sync: every N minutes
  extensionsSyncTask = cron.schedule(`*/${SYNC_INTERVALS.extensions} * * * *`, runExtensionsSync);
  extensionsSyncTask.start();

  // Background sync: every N minutes
  backgroundSyncTask = cron.schedule(`*/${SYNC_INTERVALS.background} * * * *`, runBackgroundSync);
  backgroundSyncTask.start();

  logger.info("Multi-interval scheduler started:");
  logger.info(`  - Chat messages: every ${SYNC_INTERVALS.chat} seconds`);
  logger.info(`  - Media files: every ${SYNC_INTERVALS.media} minutes`);
  logger.info(`  - Recordings: every ${SYNC_INTERVALS.recordings} minutes`);
  logger.info(`  - CDR: every ${SYNC_INTERVALS.cdr} minutes`);
  logger.info(`  - Extensions: every ${SYNC_INTERVALS.extensions} minutes`);
  logger.info(`  - Inactive tenants: every ${SYNC_INTERVALS.background} minutes`);
}

export function stopScheduler(): void {
  if (chatSyncTask) {
    chatSyncTask.stop();
    chatSyncTask = null;
  }
  if (mediaSyncTask) {
    mediaSyncTask.stop();
    mediaSyncTask = null;
  }
  if (recordingsSyncTask) {
    recordingsSyncTask.stop();
    recordingsSyncTask = null;
  }
  if (cdrSyncTask) {
    cdrSyncTask.stop();
    cdrSyncTask = null;
  }
  if (extensionsSyncTask) {
    extensionsSyncTask.stop();
    extensionsSyncTask = null;
  }
  if (backgroundSyncTask) {
    backgroundSyncTask.stop();
    backgroundSyncTask = null;
  }
  logger.info("Scheduler stopped");
}

export function isSchedulerRunning(): boolean {
  return chatSyncTask !== null || mediaSyncTask !== null;
}

export function isSyncInProgress(): boolean {
  return runningSync.size > 0;
}

export function getRunningSync(): string[] {
  return Array.from(runningSync);
}
