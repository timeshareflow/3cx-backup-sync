/**
 * Test SSH tunnel + database connection directly
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";
import { getActiveTenants, getTenantPool, testTenantConnection } from "../tenant";

async function main() {
  console.log("=".repeat(60));
  console.log("SSH Tunnel + Database Connection Test");
  console.log("=".repeat(60));

  const supabase = getSupabaseClient();

  // Get tenant
  const tenants = await getActiveTenants();

  if (tenants.length === 0) {
    console.error("No active tenants found!");
    process.exit(1);
  }

  const tenant = tenants[0];
  console.log("\n=== Tenant ===");
  console.log("Name:", tenant.name);
  console.log("3CX Host:", tenant.threecx_host);
  console.log("SSH User:", tenant.ssh_user);
  console.log("SSH Port:", tenant.ssh_port);
  console.log("Has SSH Password:", !!tenant.ssh_password);
  console.log("Has DB Password:", !!tenant.threecx_db_password);

  // Test connection
  console.log("\n=== Testing SSH Tunnel + Database Connection ===");
  const connected = await testTenantConnection(tenant);

  if (!connected) {
    console.error("\n❌ Connection test failed!");
    process.exit(1);
  }

  console.log("✅ Connection test passed!");

  // Get pool and run some queries
  const pool = await getTenantPool(tenant);
  if (!pool) {
    console.error("Failed to get pool!");
    process.exit(1);
  }

  try {
    const client = await pool.connect();

    // Check recordings table
    console.log("\n=== Checking 3CX Recordings Table ===");

    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'recordings'
    `);

    if (tableCheck.rows.length === 0) {
      console.log("❌ No 'recordings' table found!");
    } else {
      console.log("✅ 'recordings' table exists");

      // Get column names
      const columnsResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'recordings'
        ORDER BY ordinal_position
      `);
      console.log("\nRecordings table columns:");
      for (const row of columnsResult.rows) {
        console.log(`  ${row.column_name}: ${row.data_type}`);
      }

      // Count records
      const countResult = await client.query("SELECT COUNT(*) as count FROM recordings");
      console.log(`\nTotal recordings: ${countResult.rows[0].count}`);

      // Get sample recordings
      const sampleResult = await client.query(`
        SELECT *
        FROM recordings
        ORDER BY id_recording DESC
        LIMIT 5
      `);

      if (sampleResult.rows.length > 0) {
        console.log("\nSample recordings:");
        for (const row of sampleResult.rows) {
          console.log("\n  --- Recording ID:", row.id_recording, "---");
          for (const [key, value] of Object.entries(row)) {
            const displayValue = typeof value === "object" ? JSON.stringify(value) : value;
            console.log(`    ${key}: ${displayValue}`);
          }
        }
      } else {
        console.log("No recordings found in database!");
      }
    }

    client.release();
  } catch (err) {
    console.error("Query error:", (err as Error).message);
  }

  // Clean up
  await pool.end();
  console.log("\n=== Done ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
