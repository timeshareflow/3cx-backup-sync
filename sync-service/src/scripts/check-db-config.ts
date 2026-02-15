/**
 * Check the tenant's 3CX database configuration
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  console.log("=".repeat(60));
  console.log("Tenant Database Configuration Check");
  console.log("=".repeat(60));

  const supabase = getSupabaseClient();

  // Get ALL tenant columns to see what's set
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("*")
    .limit(1)
    .single();

  if (error || !tenant) {
    console.error("Error fetching tenant:", error?.message);
    process.exit(1);
  }

  console.log("\n=== All Tenant Fields ===");

  // Print relevant fields for sync
  const relevantFields = [
    "id",
    "name",
    "threecx_host",
    "sftp_host",
    "sftp_user",
    "sftp_port",
    "sftp_password",
    "ssh_user",
    "ssh_port",
    "ssh_password",
    "threecx_db_host",
    "threecx_db_port",
    "threecx_db_name",
    "threecx_db_user",
    "threecx_db_password",
    "threecx_password",
    "threecx_recordings_path",
    "backup_recordings",
    "backup_messages",
    "backup_voicemails",
    "backup_faxes",
  ];

  for (const field of relevantFields) {
    const value = tenant[field];
    if (field.includes("password")) {
      console.log(`  ${field}: ${value ? "SET (hidden)" : "NOT SET"}`);
    } else if (value === undefined) {
      console.log(`  ${field}: undefined (column may not exist)`);
    } else if (value === null) {
      console.log(`  ${field}: null`);
    } else {
      console.log(`  ${field}: ${value}`);
    }
  }

  // Check for sync prerequisites
  console.log("\n=== Sync Prerequisites ===");

  const hasSFTP = !!tenant.sftp_host && !!tenant.sftp_user && !!tenant.sftp_password;
  const hasSSH = !!tenant.ssh_user && !!tenant.ssh_password;
  const hasDBPassword = !!tenant.threecx_db_password || !!tenant.threecx_password;
  const hasHost = !!tenant.threecx_host || !!tenant.sftp_host;

  console.log(`  SFTP configured: ${hasSFTP ? "✅" : "❌"}`);
  console.log(`  SSH configured: ${hasSSH ? "✅" : "❌"}`);
  console.log(`  DB password set: ${hasDBPassword ? "✅" : "❌"}`);
  console.log(`  Host configured: ${hasHost ? "✅" : "❌"}`);

  console.log("\n=== Requirements for Recordings Sync ===");
  console.log("The recordings sync needs:");
  console.log("  1. SFTP credentials (to download files from 3CX server)");
  console.log("  2. 3CX Database credentials (to query which recordings exist)");
  console.log("");
  console.log("The database connection uses SSH tunneling, so it needs:");
  console.log("  - threecx_host (or sftp_host): the 3CX server hostname");
  console.log("  - ssh_user + ssh_password: for SSH tunnel");
  console.log("  - threecx_db_password: for PostgreSQL connection");
  console.log("");

  if (!hasDBPassword) {
    console.log("⚠️  DATABASE PASSWORD IS MISSING!");
    console.log("   The recordings sync cannot query the 3CX database without it.");
    console.log("   Please set threecx_db_password in the tenant configuration.");
  }

  if (!hasSSH && hasSFTP) {
    console.log("⚠️  SSH CREDENTIALS NOT SET (but SFTP is)");
    console.log("   Consider using the same credentials for SSH tunnel.");
  }
}

main().catch(console.error);
