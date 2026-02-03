/**
 * Test recordings sync manually
 */

import "dotenv/config";
import { Pool } from "pg";
import { getSupabaseClient } from "../storage/supabase";
import { syncRecordings } from "../sync/recordings";

async function main() {
  console.log("=".repeat(60));
  console.log("Test Recordings Sync");
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

  console.log("\nTenant:", tenant.name);
  console.log("SFTP Host:", tenant.sftp_host);
  console.log("SFTP User:", tenant.sftp_user);
  console.log("Recordings Path:", tenant.threecx_recordings_path);
  console.log("Backup Recordings:", tenant.backup_recordings);

  if (!tenant.sftp_host || !tenant.sftp_user) {
    console.error("\nError: SFTP not configured for this tenant");
    process.exit(1);
  }

  // Create 3CX database pool
  console.log("\nConnecting to 3CX database...");
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
    // Test connection
    const client = await pool.connect();
    console.log("Connected to 3CX database");
    client.release();

    // Run the sync
    console.log("\nRunning recordings sync...");
    const result = await syncRecordings(tenant, pool);

    console.log("\n" + "=".repeat(60));
    console.log("Sync Result:");
    console.log("  Files synced:", result.filesSynced);
    console.log("  Files skipped:", result.filesSkipped);
    console.log("  Errors:", result.errors.length);

    if (result.errors.length > 0) {
      console.log("\nErrors:");
      for (const err of result.errors.slice(0, 10)) {
        console.log(`  - ${err.recordingId}: ${err.error}`);
      }
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
