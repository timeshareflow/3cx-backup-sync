/**
 * Explore more CDR-related tables
 */

import "dotenv/config";
import { getActiveTenants, getTenantPool } from "../tenant";

async function main() {
  const tenants = await getActiveTenants();
  const tenant = tenants[0];
  const pool = await getTenantPool(tenant);

  if (!pool) {
    process.exit(1);
  }

  try {
    const client = await pool.connect();

    // Check more tables
    const tablesToCheck = [
      "call_history_view",
      "calldetails",
      "myphone_callhistory_v14",
      "cl_calls",
      "cl_segments",
      "cdrrecordings",
    ];

    for (const tableName of tablesToCheck) {
      try {
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        const count = parseInt(countResult.rows[0].count);

        console.log(`\n=== ${tableName}: ${count} rows ===`);

        if (count > 0) {
          // Get columns
          const columnsResult = await client.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position
          `, [tableName.replace('_view', '')]);
          console.log("Columns:", columnsResult.rows.map(r => r.column_name).join(", ") || "(view)");

          // Get sample row
          const sampleResult = await client.query(`SELECT * FROM ${tableName} ORDER BY 1 DESC LIMIT 1`);
          if (sampleResult.rows.length > 0) {
            console.log("\nSample row:");
            for (const [key, value] of Object.entries(sampleResult.rows[0])) {
              const displayValue = value === null ? "NULL" :
                typeof value === "object" ? JSON.stringify(value) :
                String(value).slice(0, 100);
              console.log(`  ${key}: ${displayValue}`);
            }
          }
        }
      } catch (e) {
        console.log(`\n=== ${tableName}: ERROR - ${(e as Error).message} ===`);
      }
    }

    client.release();
  } catch (err) {
    console.error("Error:", (err as Error).message);
  }

  await pool.end();
  process.exit(0);
}

main().catch(console.error);
