/**
 * Explore CDR-related tables in 3CX database
 */

import "dotenv/config";
import { getActiveTenants, getTenantPool } from "../tenant";

async function main() {
  console.log("=".repeat(60));
  console.log("Explore CDR Tables in 3CX");
  console.log("=".repeat(60));

  const tenants = await getActiveTenants();
  const tenant = tenants[0];
  const pool = await getTenantPool(tenant);

  if (!pool) {
    console.error("Failed to get pool!");
    process.exit(1);
  }

  try {
    const client = await pool.connect();

    // Find call-related tables
    console.log("\n=== Call-related Tables ===");
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name LIKE '%call%' OR table_name LIKE '%cl%' OR table_name LIKE '%cdr%' OR table_name LIKE '%history%')
      ORDER BY table_name
    `);
    console.log("Found tables:", tablesResult.rows.map(r => r.table_name).join(", "));

    // Check each relevant table
    const tablesToCheck = ["callhistory3", "cl", "cl_participants", "cdr", "callhistory"];

    for (const tableName of tablesToCheck) {
      try {
        // Check if table exists
        const existsResult = await client.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        `, [tableName]);

        if (existsResult.rows.length === 0) {
          console.log(`\n--- ${tableName}: NOT FOUND ---`);
          continue;
        }

        // Get row count
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        const count = countResult.rows[0].count;

        console.log(`\n--- ${tableName}: ${count} rows ---`);

        if (count > 0) {
          // Get columns
          const columnsResult = await client.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position
            LIMIT 15
          `, [tableName]);
          console.log("Columns:", columnsResult.rows.map(r => r.column_name).join(", "));

          // Get sample row
          const sampleResult = await client.query(`SELECT * FROM ${tableName} LIMIT 1`);
          if (sampleResult.rows.length > 0) {
            console.log("Sample row:");
            for (const [key, value] of Object.entries(sampleResult.rows[0])) {
              const displayValue = value === null ? "NULL" :
                typeof value === "object" ? JSON.stringify(value) :
                String(value).slice(0, 100);
              console.log(`  ${key}: ${displayValue}`);
            }
          }
        }
      } catch (e) {
        console.log(`\n--- ${tableName}: ERROR - ${(e as Error).message} ---`);
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
