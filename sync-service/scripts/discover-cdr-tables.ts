import "dotenv/config";
import { getTenantPool, getActiveTenants, testTenantConnection } from "../src/tenant";

async function discoverCdrTables() {
  console.log("=== Discovering CDR Tables in 3CX ===\n");

  const tenants = await getActiveTenants();
  if (tenants.length === 0) {
    console.log("No active tenants found");
    return;
  }

  const tenant = tenants[0];
  console.log(`Tenant: ${tenant.name}`);
  console.log(`Host: ${tenant.threecx_host}\n`);

  // Test connection
  const connected = await testTenantConnection(tenant);
  if (!connected) {
    console.log("Failed to connect to 3CX database");
    return;
  }

  const pool = await getTenantPool(tenant);
  if (!pool) {
    console.log("Failed to create pool");
    return;
  }

  const client = await pool.connect();

  try {
    // Find all tables that might contain call data
    console.log("=== Tables containing 'call' or 'cl' or 'cdr' ===");
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (
        table_name LIKE '%call%'
        OR table_name LIKE '%cdr%'
        OR table_name = 'cl'
        OR table_name LIKE '%history%'
        OR table_name LIKE '%rec%'
      )
      ORDER BY table_name
    `);

    for (const row of tablesResult.rows) {
      console.log(`  - ${row.table_name}`);
    }

    // Check if 'cl' table exists and its structure
    console.log("\n=== Checking 'cl' table ===");
    try {
      const clCheck = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'cl'
        ORDER BY ordinal_position
      `);
      if (clCheck.rows.length > 0) {
        console.log("cl table columns:");
        for (const col of clCheck.rows) {
          console.log(`  - ${col.column_name} (${col.data_type})`);
        }

        // Count records
        const countResult = await client.query("SELECT COUNT(*) as count FROM cl");
        console.log(`\nTotal records in cl: ${countResult.rows[0].count}`);

        // Sample data
        const sampleResult = await client.query("SELECT * FROM cl ORDER BY start_time DESC LIMIT 3");
        console.log("\nSample records:");
        for (const row of sampleResult.rows) {
          console.log(`  Call ID: ${row.idcl}, From: ${row.src} -> To: ${row.dst}, Time: ${row.start_time}`);
        }
      } else {
        console.log("cl table does not exist");
      }
    } catch (err) {
      console.log(`cl table error: ${(err as Error).message}`);
    }

    // Check for call_history or similar
    console.log("\n=== Checking other call tables ===");
    for (const tableName of ["cdr", "callhistory", "call_history", "callcdr"]) {
      try {
        const check = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        console.log(`${tableName}: ${check.rows[0].count} records`);
      } catch {
        console.log(`${tableName}: does not exist`);
      }
    }

    // Check callhistory3 structure
    console.log("\n=== Checking 'callhistory3' table ===");
    try {
      const colsResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'callhistory3'
        ORDER BY ordinal_position
        LIMIT 20
      `);
      console.log("callhistory3 columns (first 20):");
      for (const col of colsResult.rows) {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      }

      const countResult = await client.query("SELECT COUNT(*) as count FROM callhistory3");
      console.log(`\nTotal records: ${countResult.rows[0].count}`);

      const sampleResult = await client.query("SELECT * FROM callhistory3 ORDER BY call_start_time DESC LIMIT 2");
      console.log("\nSample records:");
      console.log(JSON.stringify(sampleResult.rows, null, 2));
    } catch (err) {
      console.log(`callhistory3 error: ${(err as Error).message}`);
    }

    // Check call_history_view
    console.log("\n=== Checking 'call_history_view' ===");
    try {
      const colsResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'call_history_view'
        ORDER BY ordinal_position
        LIMIT 20
      `);
      console.log("call_history_view columns (first 20):");
      for (const col of colsResult.rows) {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      }

      const countResult = await client.query("SELECT COUNT(*) as count FROM call_history_view");
      console.log(`\nTotal records: ${countResult.rows[0].count}`);

      const sampleResult = await client.query("SELECT * FROM call_history_view ORDER BY call_start_time DESC LIMIT 2");
      console.log("\nSample records:");
      console.log(JSON.stringify(sampleResult.rows, null, 2));
    } catch (err) {
      console.log(`call_history_view error: ${(err as Error).message}`);
    }

    // Check recordings table
    console.log("\n=== Checking 'recordings' table ===");
    try {
      const countResult = await client.query("SELECT COUNT(*) as count FROM recordings");
      console.log(`Total recordings: ${countResult.rows[0].count}`);

      const colsResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'recordings'
        ORDER BY ordinal_position
        LIMIT 15
      `);
      console.log("recordings columns (first 15):");
      for (const col of colsResult.rows) {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      }
    } catch (err) {
      console.log(`recordings error: ${(err as Error).message}`);
    }

  } finally {
    client.release();
    await pool.end();
  }

  console.log("\nDone!");
}

discoverCdrTables().catch(console.error);
