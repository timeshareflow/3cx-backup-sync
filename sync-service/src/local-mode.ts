/**
 * Local Mode - Runs directly on the customer's 3CX server
 *
 * In local mode, the sync service:
 * - Connects directly to localhost PostgreSQL (no SSH tunnel)
 * - Reads files directly from the filesystem (no SFTP)
 * - Only syncs data for a single tenant
 * - Reports heartbeats to the BackupWiz API
 */

import { Pool } from "pg";
import dotenv from "dotenv";
import { logger } from "./utils/logger";
import { getSupabaseClient, initSupabaseClient } from "./storage/supabase";
import { syncMessages } from "./sync/messages";
import { syncExtensions } from "./sync/extensions";
import { syncConversations } from "./sync/conversations";
import { syncRecordingsLocal } from "./sync/recordings-local";
import { syncVoicemailsLocal } from "./sync/voicemails-local";
import { syncCdr } from "./sync/cdr";

// Load environment variables
dotenv.config();

// Configuration from environment
interface LocalConfig {
  tenantId: string;
  agentToken: string;
  apiUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  recordingsPath: string;
  voicemailPath: string;
  chatFilesPath: string;
  faxPath: string;
  meetingsPath: string;
  syncInterval: number;
}

let config: LocalConfig;
let pool: Pool | null = null;
let syncInterval: NodeJS.Timeout | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

function loadConfig(): LocalConfig {
  const required = [
    "TENANT_ID",
    "AGENT_TOKEN",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "THREECX_DB_PASSWORD",
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    tenantId: process.env.TENANT_ID!,
    agentToken: process.env.AGENT_TOKEN!,
    apiUrl: process.env.API_URL || "https://3cxbackupwiz.com/api",
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    dbHost: process.env.THREECX_DB_HOST || "127.0.0.1",
    dbPort: parseInt(process.env.THREECX_DB_PORT || "5432"),
    dbName: process.env.THREECX_DB_NAME || "database_single",
    dbUser: process.env.THREECX_DB_USER || "phonesystem",
    dbPassword: process.env.THREECX_DB_PASSWORD!,
    recordingsPath: process.env.THREECX_RECORDINGS_PATH || "/var/lib/3cxpbx/Instance1/Data/Recordings",
    voicemailPath: process.env.THREECX_VOICEMAIL_PATH || "/var/lib/3cxpbx/Instance1/Data/Voicemail",
    chatFilesPath: process.env.THREECX_CHAT_FILES_PATH || "/var/lib/3cxpbx/Instance1/Data/Http/Files/Chat Files",
    faxPath: process.env.THREECX_FAX_PATH || "/var/lib/3cxpbx/Instance1/Data/Fax",
    meetingsPath: process.env.THREECX_MEETINGS_PATH || "/var/lib/3cxpbx/Instance1/Data/Http/Recordings",
    syncInterval: parseInt(process.env.SYNC_INTERVAL_SECONDS || "60") * 1000,
  };
}

async function createDatabasePool(): Promise<Pool> {
  const poolConfig = {
    host: config.dbHost,
    port: config.dbPort,
    database: config.dbName,
    user: config.dbUser,
    password: config.dbPassword,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: false,
  };

  const newPool = new Pool(poolConfig);

  // Test connection
  const client = await newPool.connect();
  await client.query("SELECT 1");
  client.release();

  logger.info("Connected to local 3CX PostgreSQL database");
  return newPool;
}

async function sendHeartbeat(status: string, lastError?: string): Promise<void> {
  try {
    const response = await fetch(`${config.apiUrl}/agent/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.agentToken}`,
      },
      body: JSON.stringify({
        status,
        last_sync_at: new Date().toISOString(),
        last_error: lastError || null,
      }),
    });

    if (!response.ok) {
      logger.warn("Failed to send heartbeat", { status: response.status });
    }
  } catch (error) {
    logger.warn("Heartbeat failed", { error: (error as Error).message });
  }
}

async function runLocalSync(): Promise<void> {
  if (!pool) {
    logger.error("Database pool not initialized");
    return;
  }

  const startTime = Date.now();
  let hasError = false;
  let lastError = "";

  // Create a tenant-like config for the sync functions
  const tenantConfig = {
    id: config.tenantId,
    name: "Local",
    slug: "local",
    threecx_host: config.dbHost,
    ssh_port: null,
    ssh_user: null,
    ssh_password: null,
    threecx_db_password: config.dbPassword,
    threecx_chat_files_path: config.chatFilesPath,
    threecx_recordings_path: config.recordingsPath,
    threecx_voicemail_path: config.voicemailPath,
    threecx_fax_path: config.faxPath,
    threecx_meetings_path: config.meetingsPath,
    backup_chats: true,
    backup_chat_media: true,
    backup_recordings: true,
    backup_voicemails: true,
    backup_faxes: true,
    backup_cdr: true,
    backup_meetings: true,
    is_active: true,
    sync_enabled: true,
  };

  try {
    logger.info("Starting local sync cycle...");

    // Sync extensions
    try {
      await syncExtensions(tenantConfig, pool);
      logger.debug("Extensions sync completed");
    } catch (error) {
      logger.error("Extensions sync failed", { error: (error as Error).message });
      hasError = true;
      lastError = (error as Error).message;
    }

    // Sync conversations
    try {
      await syncConversations(tenantConfig, pool);
      logger.debug("Conversations sync completed");
    } catch (error) {
      logger.error("Conversations sync failed", { error: (error as Error).message });
      hasError = true;
      lastError = (error as Error).message;
    }

    // Sync messages
    try {
      await syncMessages(tenantConfig, pool);
      logger.debug("Messages sync completed");
    } catch (error) {
      logger.error("Messages sync failed", { error: (error as Error).message });
      hasError = true;
      lastError = (error as Error).message;
    }

    // Sync recordings (local filesystem)
    try {
      await syncRecordingsLocal(tenantConfig, pool);
      logger.debug("Recordings sync completed");
    } catch (error) {
      logger.error("Recordings sync failed", { error: (error as Error).message });
      hasError = true;
      lastError = (error as Error).message;
    }

    // Sync voicemails (local filesystem)
    try {
      await syncVoicemailsLocal(tenantConfig, pool);
      logger.debug("Voicemails sync completed");
    } catch (error) {
      logger.error("Voicemails sync failed", { error: (error as Error).message });
      hasError = true;
      lastError = (error as Error).message;
    }

    // Sync CDR
    try {
      await syncCdr(tenantConfig, pool);
      logger.debug("CDR sync completed");
    } catch (error) {
      logger.error("CDR sync failed", { error: (error as Error).message });
      hasError = true;
      lastError = (error as Error).message;
    }

    const duration = Date.now() - startTime;
    logger.info(`Local sync cycle completed in ${duration}ms`, { hasError });

    // Send heartbeat
    await sendHeartbeat(hasError ? "error" : "active", hasError ? lastError : undefined);
  } catch (error) {
    logger.error("Local sync failed", { error: (error as Error).message });
    await sendHeartbeat("error", (error as Error).message);
  }
}

function startSyncScheduler(): void {
  // Run immediately
  runLocalSync();

  // Then run on interval
  syncInterval = setInterval(() => {
    runLocalSync();
  }, config.syncInterval);

  logger.info(`Sync scheduler started (interval: ${config.syncInterval / 1000}s)`);
}

function startHeartbeatScheduler(): void {
  // Send heartbeat every 5 minutes
  heartbeatInterval = setInterval(() => {
    sendHeartbeat("active");
  }, 5 * 60 * 1000);

  logger.info("Heartbeat scheduler started (interval: 5 minutes)");
}

async function initialize(): Promise<void> {
  logger.info("=====================================================");
  logger.info("  3CX BackupWiz - Local Sync Agent");
  logger.info("  Running directly on 3CX server");
  logger.info("=====================================================");
  logger.info("");

  // Load configuration
  config = loadConfig();
  logger.info("Configuration loaded");
  logger.info(`  Tenant ID: ${config.tenantId}`);
  logger.info(`  Database: ${config.dbHost}:${config.dbPort}/${config.dbName}`);
  logger.info(`  Recordings: ${config.recordingsPath}`);
  logger.info(`  Sync interval: ${config.syncInterval / 1000}s`);

  // Initialize Supabase client
  initSupabaseClient(config.supabaseUrl, config.supabaseKey);
  logger.info("Supabase client initialized");

  // Test Supabase connection
  const supabase = getSupabaseClient();
  const { error: supabaseError } = await supabase.from("sync_status").select("id").limit(1);
  if (supabaseError) {
    throw new Error(`Supabase connection failed: ${supabaseError.message}`);
  }
  logger.info("Supabase connection verified");

  // Create database pool
  pool = await createDatabasePool();

  // Send initial heartbeat
  await sendHeartbeat("active");
  logger.info("Initial heartbeat sent");
}

async function main(): Promise<void> {
  try {
    await initialize();

    // Start schedulers
    startSyncScheduler();
    startHeartbeatScheduler();

    logger.info("");
    logger.info("Local sync agent is now running");
    logger.info("Press Ctrl+C to stop");
  } catch (error) {
    logger.error("Failed to start local sync agent", {
      error: (error as Error).message,
    });
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  logger.info("");
  logger.info("Shutting down...");

  if (syncInterval) {
    clearInterval(syncInterval);
  }
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  if (pool) {
    await pool.end();
  }

  // Send final heartbeat
  await sendHeartbeat("inactive");

  logger.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", { reason });
  process.exit(1);
});

// Check if running in local mode
if (process.env.AGENT_MODE === "local") {
  main();
} else {
  // Export for use as module
  module.exports = { runLocalSync, initialize, shutdown };
}
