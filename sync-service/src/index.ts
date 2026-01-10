import dotenv from "dotenv";
import { logger } from "./utils/logger";
import { testConnection, closeConnection } from "./threecx/connection";
import { checkDatabaseSchema } from "./threecx/queries";
import { getSupabaseClient } from "./storage/supabase";
import { startScheduler, stopScheduler } from "./scheduler";
import { runFullSync, runMultiTenantSync } from "./sync";
import { getActiveTenants, closeAllTenantPools, getLegacyPool } from "./tenant";

// Load environment variables
dotenv.config();

// Check if we're in multi-tenant mode
function isMultiTenantMode(): boolean {
  return process.env.MULTI_TENANT_MODE === "true";
}

async function validateEnvironment(): Promise<void> {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "S3_BUCKET_NAME",
  ];

  // Legacy single-tenant mode requires 3CX database credentials
  if (!isMultiTenantMode()) {
    required.push("THREECX_DB_HOST", "THREECX_DB_PASSWORD");
  }

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

async function initializeSingleTenant(): Promise<void> {
  // Test 3CX database connection
  await testConnection();
  logger.info("3CX database connection verified");

  // Check database schema
  const schema = await checkDatabaseSchema();
  if (!schema.hasMessagesView || !schema.hasHistoryView) {
    logger.warn("Some expected 3CX views are missing", schema);
  } else {
    logger.info("3CX database schema verified");
  }
}

async function initializeMultiTenant(): Promise<void> {
  logger.info("Running in multi-tenant mode");

  // Fetch active tenants from Supabase
  const tenants = await getActiveTenants();
  logger.info(`Found ${tenants.length} active tenants with 3CX configuration`);

  if (tenants.length === 0) {
    logger.warn("No active tenants configured. Add tenants via the admin dashboard.");
  }
}

async function initialize(): Promise<void> {
  logger.info("=== 3CX Chat Archiver Sync Service ===");
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

  // Initialize based on mode
  if (isMultiTenantMode()) {
    await initializeMultiTenant();
  } else {
    await initializeSingleTenant();
  }
}

async function main(): Promise<void> {
  try {
    await initialize();

    // Run initial sync
    logger.info("Running initial sync...");

    if (isMultiTenantMode()) {
      const result = await runMultiTenantSync();
      logger.info("Initial multi-tenant sync completed", {
        successCount: result.successCount,
        failureCount: result.failureCount,
        duration: `${result.totalDuration}ms`,
      });
    } else {
      const pool = getLegacyPool();
      await runFullSync({ pool });
    }

    // Start scheduled sync
    startScheduler();

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
  logger.info("Shutting down...");

  stopScheduler();

  // Close connections based on mode
  if (isMultiTenantMode()) {
    await closeAllTenantPools();
  } else {
    await closeConnection();
  }

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
