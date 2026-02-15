/**
 * Run voicemails sync
 */

import "dotenv/config";
import { getActiveTenants, getTenantPool } from "../tenant";
import { syncVoicemails } from "../sync/voicemails";

async function main() {
  console.log("=".repeat(60));
  console.log("Run Voicemails Sync");
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
    const result = await syncVoicemails(tenant, pool);

    console.log("\n=== Sync Result ===");
    console.log("Files synced:", result.filesSynced);
    console.log("Files skipped:", result.filesSkipped);
    console.log("Errors:", result.errors.length);

    if (result.errors.length > 0) {
      console.log("\nErrors:");
      for (const err of result.errors.slice(0, 5)) {
        console.log(`  - ${err.voicemailId}: ${err.error}`);
      }
    }
  } catch (err) {
    console.error("Sync error:", (err as Error).message);
  }

  await pool.end();
  process.exit(0);
}

main().catch(console.error);
