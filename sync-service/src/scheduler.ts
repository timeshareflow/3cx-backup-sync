import cron from "node-cron";
import { logger } from "./utils/logger";
import { runMultiTenantSync, runMultiTenantSyncByType, SyncType } from "./sync";
import { getSupabaseClient } from "./storage/supabase";
import { getActiveTenants, getActiveUserTenants, getInactiveTenants } from "./tenant";

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
// NOTE: Computed lazily via getSyncIntervals() because dotenv.config() runs after module imports
function getSyncIntervals() {
  return {
    chat: parseInt(process.env.SYNC_INTERVAL_CHAT || "20"), // seconds
    media: parseInt(process.env.SYNC_INTERVAL_MEDIA || "5"), // minutes
    recordings: parseInt(process.env.SYNC_INTERVAL_RECORDINGS || "15"), // minutes
    cdr: parseInt(process.env.SYNC_INTERVAL_CDR || "5"), // minutes
    extensions: parseInt(process.env.SYNC_INTERVAL_EXTENSIONS || "60"), // minutes
    background: parseInt(process.env.SYNC_INTERVAL_BACKGROUND || "30"), // minutes - full sync for inactive tenants
  };
}

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

// Check if there are recent messages with media that haven't been linked to media files yet
async function hasRecentUnlinkedMedia(): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    // Find messages created in the last 2 minutes with has_media=true
    const { data } = await supabase
      .from("messages")
      .select("id, media_files(id)")
      .eq("has_media", true)
      .gt("created_at", twoMinutesAgo)
      .limit(10);

    // Check if any have no linked media_files
    return (data || []).some((m: { media_files?: { id: string }[] }) => !m.media_files || m.media_files.length === 0);
  } catch {
    return false;
  }
}

// Run chat/messages sync (fast - every 15-30 seconds)
// CRITICAL: Messages sync should NEVER be blocked by media/recordings/full sync
// This ensures chats are always up to date regardless of what else is running
async function runChatSync(): Promise<void> {
  if (runningSync.has("messages")) {
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

    // After chat sync, check if new media messages need files downloaded
    // Triggers an immediate media sync so thumbnails appear quickly
    if (!runningSync.has("media") && !runningSync.has("full")) {
      const needsMedia = await hasRecentUnlinkedMedia();
      if (needsMedia) {
        logger.info("New media messages detected - triggering immediate media sync");
        runMediaSync();
      }
    }
  } catch (error) {
    logger.error("Chat sync failed", { error: (error as Error).message });
  } finally {
    runningSync.delete("messages");
  }
}

// Run media sync (every 5 minutes)
// CRITICAL: Media sync runs for ALL active tenants, not just those with active users
// This ensures media files are always backed up regardless of user activity
async function runMediaSync(): Promise<void> {
  if (runningSync.has("media") || runningSync.has("full")) {
    logger.debug("Media sync skipped - already running");
    return;
  }

  try {
    // Use getActiveTenants (all enabled tenants) instead of getActiveUserTenants
    // Media backup should happen regardless of whether users are logged in
    const allTenants = await getActiveTenants();
    if (allTenants.length === 0) {
      return;
    }

    runningSync.add("media");

    logger.info(`Media sync for ${allTenants.length} tenant(s)`);

    await runMultiTenantSyncByType(
      ["media", "voicemails"],
      allTenants.map((t) => t.id)
    );
  } catch (error) {
    logger.error("Media sync failed", { error: (error as Error).message });
  } finally {
    runningSync.delete("media");
  }
}

// Run recordings sync (every 15 minutes)
// CRITICAL: Recordings sync runs for ALL active tenants, not just those with active users
// This ensures call recordings are always backed up regardless of user activity
async function runRecordingsSync(): Promise<void> {
  if (runningSync.has("recordings") || runningSync.has("full")) {
    logger.debug("Recordings sync skipped - already running");
    return;
  }

  try {
    // Use getActiveTenants (all enabled tenants) instead of getActiveUserTenants
    // Recording backup should happen regardless of whether users are logged in
    const allTenants = await getActiveTenants();
    if (allTenants.length === 0) {
      return;
    }

    runningSync.add("recordings");

    logger.info(`Recordings sync for ${allTenants.length} tenant(s)`);

    await runMultiTenantSyncByType(
      ["recordings", "meetings", "faxes"],
      allTenants.map((t) => t.id)
    );
  } catch (error) {
    logger.error("Recordings sync failed", { error: (error as Error).message });
  } finally {
    runningSync.delete("recordings");
  }
}

// Run CDR sync (every 5 minutes)
// CDR is lightweight like messages, so don't block on full sync
async function runCdrSync(): Promise<void> {
  if (runningSync.has("cdr")) {
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

// Run extensions sync (every hour) - runs for ALL active tenants, not just those with active users
async function runExtensionsSync(): Promise<void> {
  if (runningSync.has("extensions") || runningSync.has("full")) {
    logger.debug("Extensions sync skipped - already running");
    return;
  }

  try {
    // Use getActiveTenants (all enabled tenants) instead of getActiveUserTenants
    // Extensions should sync regardless of user activity to keep names up to date
    const allTenants = await getActiveTenants();
    if (allTenants.length === 0) {
      return;
    }

    runningSync.add("extensions");

    logger.info(`Extensions sync for ${allTenants.length} tenant(s)`);

    await runMultiTenantSyncByType(
      ["extensions"],
      allTenants.map((t) => t.id)
    );
  } catch (error) {
    logger.error("Extensions sync failed", { error: (error as Error).message });
  } finally {
    runningSync.delete("extensions");
  }
}

// Run lightweight sync for inactive tenants (every 30 minutes)
// Only syncs messages and CDR - media/recordings now run for all tenants via dedicated schedulers
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

    logger.info(`Background full sync for ${inactiveTenants.length} inactive tenant(s)`);

    // Only sync messages and CDR for inactive tenants to keep data fresh
    // Media/recordings sync is heavier and only runs when users are active
    await runMultiTenantSyncByType(
      ["messages", "cdr"],
      inactiveTenants.map((t) => t.id)
    );
  } catch (error) {
    logger.error("Background sync failed", { error: (error as Error).message });
  } finally {
    runningSync.delete("full");
  }
}

export function startScheduler(): void {
  const intervals = getSyncIntervals();

  logger.info("Starting multi-interval scheduler", {
    chatInterval: `${intervals.chat}s`,
    mediaInterval: `${intervals.media}m`,
    recordingsInterval: `${intervals.recordings}m`,
    cdrInterval: `${intervals.cdr}m`,
    extensionsInterval: `${intervals.extensions}m`,
    backgroundInterval: `${intervals.background}m`,
  });

  // Chat sync: every N seconds (use setInterval for sub-minute)
  const chatIntervalMs = intervals.chat * 1000;
  const chatIntervalId = setInterval(runChatSync, chatIntervalMs);
  chatSyncTask = {
    start: () => {},
    stop: () => clearInterval(chatIntervalId),
  } as cron.ScheduledTask;

  // Media sync: every N minutes
  mediaSyncTask = cron.schedule(`*/${intervals.media} * * * *`, runMediaSync);
  mediaSyncTask.start();

  // Recordings sync: every N minutes
  recordingsSyncTask = cron.schedule(`*/${intervals.recordings} * * * *`, runRecordingsSync);
  recordingsSyncTask.start();

  // CDR sync: every N minutes
  cdrSyncTask = cron.schedule(`*/${intervals.cdr} * * * *`, runCdrSync);
  cdrSyncTask.start();

  // Extensions sync: every N minutes
  extensionsSyncTask = cron.schedule(`*/${intervals.extensions} * * * *`, runExtensionsSync);
  extensionsSyncTask.start();

  // Background sync: every N minutes
  backgroundSyncTask = cron.schedule(`*/${intervals.background} * * * *`, runBackgroundSync);
  backgroundSyncTask.start();

  logger.info("Multi-interval scheduler started:");
  logger.info(`  - Chat messages: every ${intervals.chat} seconds`);
  logger.info(`  - Media files: every ${intervals.media} minutes`);
  logger.info(`  - Recordings: every ${intervals.recordings} minutes`);
  logger.info(`  - CDR: every ${intervals.cdr} minutes`);
  logger.info(`  - Extensions: every ${intervals.extensions} minutes`);
  logger.info(`  - Background full sync (inactive tenants): every ${intervals.background} minutes`);
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
