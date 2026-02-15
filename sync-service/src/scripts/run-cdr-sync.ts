/**
 * Run CDR sync
 */

import "dotenv/config";
import { getActiveTenants, getTenantPool } from "../tenant";
import { syncCdr } from "../sync/cdr";

async function main() {
  console.log("=".repeat(60));
  console.log("Run CDR Sync");
  console.log("=".repeat(60));

  const tenants = await getActiveTenants();
  const tenant = tenants[0];
  console.log("\nTenant:", tenant.name);

  const pool = await getTenantPool(tenant);
  if (!pool) {
    console.error("Failed to get pool!");
    process.exit(1);
  }

  try {
    const result = await syncCdr(pool, tenant.id);

    console.log("\n=== Sync Result ===");
    console.log("Records synced:", result.recordsSynced);
    console.log("Records skipped:", result.recordsSkipped);
    console.log("Errors:", result.errors.length);

    if (result.errors.length > 0) {
      console.log("\nFirst 5 errors:");
      for (const err of result.errors.slice(0, 5)) {
        console.log(`  - ${err.callId}: ${err.error}`);
      }
    }
  } catch (err) {
    console.error("Sync error:", (err as Error).message);
  }

  await pool.end();
  process.exit(0);
}

main().catch(console.error);
