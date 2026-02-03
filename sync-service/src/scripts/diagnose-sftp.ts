/**
 * Diagnose SFTP connection and recording paths
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";
import { createSftpClient, closeSftpClient, listRemoteFilesRecursive } from "../storage/sftp";
import { Pool } from "pg";

async function main() {
  console.log("=".repeat(60));
  console.log("SFTP & Recordings Diagnostic");
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
  console.log("Name:", tenant.name);
  console.log("SFTP Host:", tenant.sftp_host || "NOT SET");
  console.log("SFTP User:", tenant.sftp_user || "NOT SET");
  console.log("SFTP Port:", tenant.sftp_port || 22);
  console.log("SFTP Password:", tenant.sftp_password ? "SET (hidden)" : "NOT SET");
  console.log("Recordings Path:", tenant.threecx_recordings_path || "/var/lib/3cxpbx/Instance1/Data/Recordings");

  if (!tenant.sftp_host || !tenant.sftp_user) {
    console.error("\nError: SFTP not configured!");
    process.exit(1);
  }

  // Test SFTP connection
  console.log("\n=== Testing SFTP Connection ===");
  let sftp;
  try {
    sftp = await createSftpClient({
      host: tenant.sftp_host,
      port: tenant.sftp_port || 22,
      username: tenant.sftp_user,
      password: tenant.sftp_password,
    });
    console.log("✅ SFTP connected successfully!");

    // List files in recordings directory
    const recordingsPath = tenant.threecx_recordings_path || "/var/lib/3cxpbx/Instance1/Data/Recordings";
    console.log(`\n=== Listing files in ${recordingsPath} ===`);

    try {
      const files = await listRemoteFilesRecursive(sftp, recordingsPath);
      console.log(`Found ${files.length} files total`);

      // Show first 10 files
      if (files.length > 0) {
        console.log("\nFirst 10 files:");
        for (const file of files.slice(0, 10)) {
          console.log(`  ${file.relativePath} (${(file.size / 1024).toFixed(1)} KB)`);
        }
        if (files.length > 10) {
          console.log(`  ... and ${files.length - 10} more`);
        }
      }
    } catch (listErr) {
      console.log("Error listing directory:", (listErr as Error).message);

      // Try some alternative paths
      console.log("\nTrying alternative paths...");
      const altPaths = [
        "/var/lib/3cxpbx/Instance1/Data/Recordings",
        "/home/phonesystem/Recordings",
        "/var/3CX/Recordings",
        "/opt/3cxpbx/Recordings",
      ];

      for (const path of altPaths) {
        try {
          const exists = await sftp.exists(path);
          console.log(`  ${path}: ${exists ? "EXISTS" : "not found"}`);
          if (exists) {
            const files = await sftp.list(path);
            console.log(`    Contains ${files.length} items`);
          }
        } catch (e) {
          console.log(`  ${path}: error - ${(e as Error).message}`);
        }
      }
    }

    // Check what recording URLs look like in the 3CX database
    console.log("\n=== Checking 3CX Database ===");
    if (tenant.threecx_db_host) {
      try {
        const pool = new Pool({
          host: tenant.threecx_db_host,
          port: tenant.threecx_db_port || 5432,
          database: tenant.threecx_db_name || "database_single",
          user: tenant.threecx_db_user,
          password: tenant.threecx_db_password,
          ssl: false,
          connectionTimeoutMillis: 5000,
        });

        const result = await pool.query(`
          SELECT recording_url
          FROM recordings
          LIMIT 5
        `);

        console.log("Sample recording URLs from 3CX:");
        for (const row of result.rows) {
          console.log(`  ${row.recording_url}`);
        }

        await pool.end();
      } catch (dbErr) {
        console.log("Cannot connect to 3CX database from here (expected if running locally)");
      }
    }
  } catch (sftpErr) {
    console.error("❌ SFTP connection failed:", (sftpErr as Error).message);
    console.log("\nPossible issues:");
    console.log("  - Wrong password");
    console.log("  - SSH key required instead of password");
    console.log("  - Firewall blocking connection");
    console.log("  - Wrong host/port");
  } finally {
    if (sftp) {
      await closeSftpClient(sftp);
    }
  }
}

main().catch(console.error);
