/**
 * Test the CDR query
 */

import "dotenv/config";
import { getActiveTenants, getTenantPool } from "../tenant";
import { getCallRecords } from "../threecx/queries";

async function main() {
  console.log("=".repeat(60));
  console.log("Test CDR Query");
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
    console.log("\n=== Testing getCallRecords with null since ===");
    const allRecords = await getCallRecords(null, 10, pool);
    console.log(`Returned ${allRecords.length} CDR records (limit 10)`);

    if (allRecords.length > 0) {
      console.log("\nSample records:");
      for (const rec of allRecords.slice(0, 3)) {
        console.log(`  - Call ID: ${rec.call_id}`);
        console.log(`    Caller: ${rec.caller_number || "N/A"} (${rec.caller_name || "N/A"})`);
        console.log(`    Callee: ${rec.callee_number || "N/A"} (${rec.callee_name || "N/A"})`);
        console.log(`    Direction: ${rec.direction}`);
        console.log(`    Status: ${rec.status}`);
        console.log(`    Started: ${rec.call_started_at}`);
        console.log(`    Duration: ${rec.total_duration}s`);
        console.log("");
      }
    }

    // Test with since = 2026-01-01
    console.log("\n=== Testing getCallRecords with since = 2026-01-01 ===");
    const since = new Date("2026-01-01T00:00:00Z");
    const newRecords = await getCallRecords(since, 10, pool);
    console.log(`Returned ${newRecords.length} CDR records since 2026-01-01`);

  } catch (err) {
    console.error("Error:", (err as Error).message);
    console.error((err as Error).stack);
  }

  await pool.end();
  console.log("\n=== Done ===");
  process.exit(0);
}

main().catch(console.error);
