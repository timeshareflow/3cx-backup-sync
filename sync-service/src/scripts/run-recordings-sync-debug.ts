/**
 * Run the actual recordings sync with detailed logging
 */

import "dotenv/config";
import { getActiveTenants, getTenantPool } from "../tenant";
import { syncRecordings } from "../sync/recordings";

async function main() {
  console.log("=".repeat(60));
  console.log("Run Recordings Sync with Debug");
  console.log("=".repeat(60));

  // Set log level to debug
  process.env.LOG_LEVEL = "debug";

  const tenants = await getActiveTenants();
  const tenant = tenants[0];
  console.log("\nTenant:", tenant.name);
  console.log("Backup recordings:", tenant.backup_recordings);

  const pool = await getTenantPool(tenant);
  if (!pool) {
    console.error("Failed to get pool!");
    process.exit(1);
  }

  console.log("\n=== Starting Recordings Sync ===\n");

  try {
    const result = await syncRecordings(tenant, pool);

    console.log("\n=== Sync Result ===");
    console.log("Files synced:", result.filesSynced);
    console.log("Files skipped:", result.filesSkipped);
    console.log("Errors:", result.errors.length);

    if (result.errors.length > 0) {
      console.log("\nErrors:");
      for (const err of result.errors) {
        console.log(`  - ${err.recordingId}: ${err.error}`);
      }
    }
  } catch (err) {
    console.error("\nSync failed with error:", (err as Error).message);
    console.error((err as Error).stack);
  }

  await pool.end();
  console.log("\n=== Done ===");
  process.exit(0);
}

main().catch(console.error);
