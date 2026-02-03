/**
 * Test the actual recordings query used by the sync
 */

import "dotenv/config";
import { getActiveTenants, getTenantPool } from "../tenant";
import { getRecordings } from "../threecx/queries";

async function main() {
  console.log("=".repeat(60));
  console.log("Test Recordings Query");
  console.log("=".repeat(60));

  const tenants = await getActiveTenants();
  if (tenants.length === 0) {
    console.error("No active tenants!");
    process.exit(1);
  }

  const tenant = tenants[0];
  console.log("\nTenant:", tenant.name);

  const pool = await getTenantPool(tenant);
  if (!pool) {
    console.error("Failed to get pool!");
    process.exit(1);
  }

  try {
    // Test with no since date (get all)
    console.log("\n=== Testing getRecordings with null since ===");
    const allRecordings = await getRecordings(null, 10, pool);
    console.log(`Returned ${allRecordings.length} recordings (limit 10)`);

    if (allRecordings.length > 0) {
      console.log("\nSample recordings:");
      for (const rec of allRecordings.slice(0, 3)) {
        console.log(`  - ID: ${rec.recording_id}`);
        console.log(`    URL: ${rec.recording_url}`);
        console.log(`    Start: ${rec.start_time}`);
        console.log(`    Extension: ${rec.extension_number || "null"}`);
        console.log(`    Caller: ${rec.caller_number || "null"}`);
        console.log("");
      }
    }

    // Test with since = 2026-01-01 (what the sync uses)
    console.log("\n=== Testing getRecordings with since = 2026-01-01 ===");
    const since = new Date("2026-01-01T00:00:00Z");
    const newRecordings = await getRecordings(since, 10, pool);
    console.log(`Returned ${newRecordings.length} recordings since 2026-01-01`);

    if (newRecordings.length > 0) {
      console.log("\nSample recordings:");
      for (const rec of newRecordings.slice(0, 3)) {
        console.log(`  - ID: ${rec.recording_id}`);
        console.log(`    URL: ${rec.recording_url}`);
        console.log(`    Start: ${rec.start_time}`);
        console.log("");
      }
    }

  } catch (err) {
    console.error("Error:", (err as Error).message);
    console.error((err as Error).stack);
  }

  await pool.end();
  console.log("\n=== Done ===");
  process.exit(0);
}

main().catch(console.error);
