import dotenv from "dotenv";
import { logger } from "./utils/logger";
import { getSupabaseClient } from "./storage/supabase";
import { startScheduler, stopScheduler } from "./scheduler";
import { runMultiTenantSync } from "./sync";
import { getActiveTenants, closeAllTenantPools } from "./tenant";

// Load environment variables
dotenv.config();

async function validateEnvironment(): Promise<void> {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

async function initialize(): Promise<void> {
  logger.info("=====================================================");
  logger.info("  3CX BackupWiz - Centralized Sync Service");
  logger.info("  Connects remotely to customer 3CX servers");
  logger.info("=====================================================");
  logger.info("");
  logger.info("Initializing...");

  // Validate environment
  await validateEnvironment();
  logger.info("Environment validated");

  // Test Supabase connection
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("sync_status").select("id").limit(1);
  if (error) {
    throw new Error(`Supabase connection failed: ${error.message}`);
  }
  logger.info("Supabase connection verified");

  // Fetch active tenants from Supabase
  const tenants = await getActiveTenants();
  logger.info(`Found ${tenants.length} active tenants with 3CX configuration`);

  if (tenants.length === 0) {
    logger.warn("No active tenants configured. Add tenants via the admin dashboard.");
    logger.warn("Tenants need:");
    logger.warn("  - 3CX database credentials (host, user, password)");
    logger.warn("  - SFTP credentials (for file backup - optional)");
    logger.warn("  - sync_enabled = true");
  } else {
    for (const tenant of tenants) {
      logger.info(`  - ${tenant.name}: ${tenant.threecx_host}:${tenant.threecx_port || 5432}`);
    }
  }
}

async function main(): Promise<void> {
  try {
    await initialize();

    // Run initial sync
    logger.info("");
    logger.info("Running initial sync...");

    const result = await runMultiTenantSync();
    logger.info("Initial sync completed", {
      successCount: result.successCount,
      failureCount: result.failureCount,
      duration: `${result.totalDuration}ms`,
    });

    // Start scheduled sync
    startScheduler();

    logger.info("");
    logger.info("Sync service is now running");
    logger.info("Press Ctrl+C to stop");
  } catch (error) {
    logger.error("Failed to start sync service", {
      error: (error as Error).message,
    });
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  logger.info("");
  logger.info("Shutting down...");

  stopScheduler();
  await closeAllTenantPools();

  logger.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", { reason });
  process.exit(1);
});

// Start the service
main();
