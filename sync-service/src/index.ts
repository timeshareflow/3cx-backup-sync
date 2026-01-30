// v1.0.1 - Auto-deploy test
import dotenv from "dotenv";
import http from "http";
import { logger } from "./utils/logger";
import { getSupabaseClient } from "./storage/supabase";
import { startScheduler, stopScheduler } from "./scheduler";
import { runMultiTenantSync } from "./sync";
import { getActiveTenants, closeAllTenantPools, testTenantConnection } from "./tenant";
import { resetAllCircuits } from "./utils/circuit-breaker";

// Load environment variables
dotenv.config();

// Track service state
let lastSyncTime: Date | null = null;
let lastSyncResult: { successCount: number; failureCount: number; totalDuration: number } | null = null;
let isSyncing = false;

// Track per-tenant status
interface TenantStatus {
  id: string;
  name: string;
  host: string | null;
  connected: boolean;
  lastSyncTime: Date | null;
  lastSyncSuccess: boolean | null;
  lastError: string | null;
  messagesSynced: number;
}
const tenantStatuses: Map<string, TenantStatus> = new Map();

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

  // Reset all circuit breakers on startup for clean slate
  resetAllCircuits();
  logger.info("Circuit breakers reset");

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
      logger.info(`  - ${tenant.name}: ${tenant.threecx_host} (SSH port ${tenant.ssh_port || 22})`);

      // Initialize tenant status
      tenantStatuses.set(tenant.id, {
        id: tenant.id,
        name: tenant.name,
        host: tenant.threecx_host,
        connected: false,
        lastSyncTime: null,
        lastSyncSuccess: null,
        lastError: null,
        messagesSynced: 0,
      });

      // Test connection
      const connected = await testTenantConnection(tenant);
      const status = tenantStatuses.get(tenant.id)!;
      status.connected = connected;
      if (!connected) {
        status.lastError = "Initial connection failed";
      }
    }
  }
}

// Control server for remote management
function startControlServer(): void {
  const port = parseInt(process.env.CONTROL_PORT || "3001", 10);
  const authToken = process.env.CONTROL_AUTH_TOKEN;

  if (!authToken) {
    logger.warn("CONTROL_AUTH_TOKEN not set - control server disabled");
    return;
  }

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Auth check
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${authToken}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const url = new URL(req.url || "/", `http://localhost:${port}`);

    // Status endpoint
    if (url.pathname === "/status" && req.method === "GET") {
      const tenants = Array.from(tenantStatuses.values()).map(t => ({
        id: t.id,
        name: t.name,
        host: t.host,
        connected: t.connected,
        lastSyncTime: t.lastSyncTime?.toISOString() || null,
        lastSyncSuccess: t.lastSyncSuccess,
        lastError: t.lastError,
        messagesSynced: t.messagesSynced,
      }));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "running",
        isSyncing,
        lastSyncTime: lastSyncTime?.toISOString() || null,
        lastSyncResult,
        uptime: process.uptime(),
        tenants,
        configuredTenants: tenants.length,
        connectedTenants: tenants.filter(t => t.connected).length,
      }));
      return;
    }

    // Tenants endpoint - detailed tenant info
    if (url.pathname === "/tenants" && req.method === "GET") {
      const tenants = Array.from(tenantStatuses.values()).map(t => ({
        id: t.id,
        name: t.name,
        host: t.host,
        connected: t.connected,
        lastSyncTime: t.lastSyncTime?.toISOString() || null,
        lastSyncSuccess: t.lastSyncSuccess,
        lastError: t.lastError,
        messagesSynced: t.messagesSynced,
      }));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ tenants }));
      return;
    }

    // Test connection endpoint
    if (url.pathname === "/test-connections" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Testing connections..." }));

      // Test all connections in background
      testAllConnections();
      return;
    }

    // Manual sync trigger
    if (url.pathname === "/sync" && req.method === "POST") {
      if (isSyncing) {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Sync already in progress" }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Sync started" }));

      // Run sync in background
      runManualSync();
      return;
    }

    // Restart endpoint - PM2 will auto-restart
    if (url.pathname === "/restart" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Restarting..." }));

      logger.info("Restart requested via control API");
      setTimeout(() => process.exit(0), 500);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(port, () => {
    logger.info(`Control server listening on port ${port}`);
  });
}

async function testAllConnections(): Promise<void> {
  logger.info("Testing all tenant connections...");
  const tenants = await getActiveTenants();

  for (const tenant of tenants) {
    const connected = await testTenantConnection(tenant);
    let status = tenantStatuses.get(tenant.id);

    if (!status) {
      status = {
        id: tenant.id,
        name: tenant.name,
        host: tenant.threecx_host,
        connected: false,
        lastSyncTime: null,
        lastSyncSuccess: null,
        lastError: null,
        messagesSynced: 0,
      };
      tenantStatuses.set(tenant.id, status);
    }

    status.connected = connected;
    if (!connected) {
      status.lastError = "Connection test failed";
    } else {
      status.lastError = null;
    }

    logger.info(`Tenant ${tenant.name}: ${connected ? "connected" : "failed"}`);
  }
}

// Update tenant status after sync (called from sync module)
export function updateTenantSyncStatus(
  tenantId: string,
  success: boolean,
  messagesSynced: number,
  error?: string
): void {
  const status = tenantStatuses.get(tenantId);
  if (status) {
    status.lastSyncTime = new Date();
    status.lastSyncSuccess = success;
    status.connected = success;
    if (success) {
      status.messagesSynced += messagesSynced;
      status.lastError = null;
    } else {
      status.lastError = error || "Sync failed";
    }
  }
}

// Update tenant statuses from sync results
function updateTenantStatusesFromResults(results: Array<{
  tenantId: string;
  tenantName: string;
  success: boolean;
  error?: string;
  messages: { messagesSynced: number };
}>): void {
  for (const result of results) {
    let status = tenantStatuses.get(result.tenantId);

    if (!status) {
      status = {
        id: result.tenantId,
        name: result.tenantName,
        host: null,
        connected: false,
        lastSyncTime: null,
        lastSyncSuccess: null,
        lastError: null,
        messagesSynced: 0,
      };
      tenantStatuses.set(result.tenantId, status);
    }

    status.lastSyncTime = new Date();
    status.lastSyncSuccess = result.success;
    status.connected = result.success;

    if (result.success) {
      status.messagesSynced += result.messages.messagesSynced;
      status.lastError = null;
    } else {
      status.lastError = result.error || "Sync failed";
    }
  }
}

async function runManualSync(): Promise<void> {
  if (isSyncing) return;

  isSyncing = true;
  logger.info("Manual sync triggered");

  try {
    const result = await runMultiTenantSync();
    lastSyncTime = new Date();
    lastSyncResult = result;

    // Update per-tenant statuses
    updateTenantStatusesFromResults(result.results);

    logger.info("Manual sync completed", {
      successCount: result.successCount,
      failureCount: result.failureCount,
      duration: `${result.totalDuration}ms`,
    });
  } catch (error) {
    logger.error("Manual sync failed", { error: (error as Error).message });
  } finally {
    isSyncing = false;
  }
}

async function main(): Promise<void> {
  try {
    await initialize();

    // Start control server
    startControlServer();

    // Run initial sync
    logger.info("");
    logger.info("Running initial sync...");

    isSyncing = true;
    const result = await runMultiTenantSync();
    lastSyncTime = new Date();
    lastSyncResult = result;

    // Update per-tenant statuses
    updateTenantStatusesFromResults(result.results);

    isSyncing = false;

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
