/**
 * Diagnose the recordings query to see what data we're getting from 3CX
 */

import "dotenv/config";
import { Pool } from "pg";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  console.log("=".repeat(60));
  console.log("Recordings Query Diagnostic");
  console.log("=".repeat(60));

  const supabase = getSupabaseClient();

  // Get tenant config
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("*")
    .limit(1)
    .single();

  if (error || !tenant) {
    console.error("Error fetching tenant:", error?.message);
    process.exit(1);
  }

  console.log("\n=== Tenant Configuration ===");
  console.log("3CX DB Host:", tenant.threecx_db_host);
  console.log("3CX DB Name:", tenant.threecx_db_name || "database_single");

  if (!tenant.threecx_db_host) {
    console.error("\nError: 3CX database not configured!");
    process.exit(1);
  }

  // Connect to 3CX database
  const pool = new Pool({
    host: tenant.threecx_db_host,
    port: tenant.threecx_db_port || 5432,
    database: tenant.threecx_db_name || "database_single",
    user: tenant.threecx_db_user,
    password: tenant.threecx_db_password,
    ssl: false,
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();
    console.log("\n✅ Connected to 3CX database");

    // Check recordings table exists
    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'recordings'
    `);

    if (tableCheck.rows.length === 0) {
      console.error("\n❌ No 'recordings' table found in 3CX database!");
      client.release();
      return;
    }

    // Get column names from recordings table
    console.log("\n=== Recordings Table Schema ===");
    const columnsResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'recordings'
      ORDER BY ordinal_position
    `);
    for (const row of columnsResult.rows) {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    }

    // Get sample recordings with all columns
    console.log("\n=== Sample Recordings (raw data) ===");
    const recordingsResult = await client.query(`
      SELECT *
      FROM recordings
      ORDER BY id_recording DESC
      LIMIT 5
    `);

    if (recordingsResult.rows.length === 0) {
      console.log("No recordings found in database!");
    } else {
      for (const row of recordingsResult.rows) {
        console.log("\n--- Recording ID:", row.id_recording, "---");
        for (const [key, value] of Object.entries(row)) {
          console.log(`  ${key}: ${value}`);
        }
      }
    }

    // Check if there's a related table with call info (cl_participants)
    console.log("\n=== Looking for related call participant tables ===");
    const relatedTables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name LIKE '%participant%' OR table_name LIKE '%cl%' OR table_name LIKE 'call%')
      ORDER BY table_name
    `);
    console.log("Found tables:", relatedTables.rows.map(r => r.table_name).join(", "));

    // Check if recordings have cl_participants_id and try to join
    if (columnsResult.rows.some(r => r.column_name === "cl_participants_id")) {
      console.log("\n=== Recordings with Call Participant Info ===");
      try {
        const joinedResult = await client.query(`
          SELECT
            r.id_recording,
            r.recording_url,
            r.start_time,
            p.dn as extension_number,
            p.src as caller,
            p.dst as callee
          FROM recordings r
          LEFT JOIN cl_participants p ON p.idcl_participants = r.cl_participants_id
          ORDER BY r.id_recording DESC
          LIMIT 10
        `);

        for (const row of joinedResult.rows) {
          console.log(`\n  Recording ${row.id_recording}:`);
          console.log(`    URL: ${row.recording_url}`);
          console.log(`    Extension: ${row.extension_number || "NULL"}`);
          console.log(`    Caller: ${row.caller || "NULL"}`);
          console.log(`    Callee: ${row.callee || "NULL"}`);
        }
      } catch (e) {
        console.log("Join failed:", (e as Error).message);

        // Try to look at cl_participants structure
        const partColumns = await client.query(`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = 'cl_participants'
          ORDER BY ordinal_position
        `);
        console.log("\ncl_participants columns:");
        for (const row of partColumns.rows) {
          console.log(`  ${row.column_name}: ${row.data_type}`);
        }
      }
    }

    // Look at the actual recording URLs to understand the pattern
    console.log("\n=== Recording URL Patterns ===");
    const urlResult = await client.query(`
      SELECT recording_url, COUNT(*) as count
      FROM recordings
      GROUP BY recording_url
      ORDER BY count DESC
      LIMIT 20
    `);
    for (const row of urlResult.rows) {
      console.log(`  ${row.recording_url} (${row.count}x)`);
    }

    client.release();
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
