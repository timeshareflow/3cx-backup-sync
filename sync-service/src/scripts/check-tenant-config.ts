import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  const supabase = getSupabaseClient();

  // Get the tenant config
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("id, name, backup_recordings, sftp_host, sftp_user, sftp_port, threecx_recordings_path")
    .limit(1)
    .single();

  if (tenantErr) {
    console.log("Error fetching tenant:", tenantErr.message);
    return;
  }

  console.log("Tenant config:");
  console.log("  Name:", tenant?.name);
  console.log("  backup_recordings:", tenant?.backup_recordings);
  console.log("  SFTP Host:", tenant?.sftp_host || "NOT SET");
  console.log("  SFTP User:", tenant?.sftp_user || "NOT SET");
  console.log("  SFTP Port:", tenant?.sftp_port || 22);
  console.log("  Recordings Path:", tenant?.threecx_recordings_path || "default");

  // Get latest recordings sync status
  const { data: syncStatus, error: syncErr } = await supabase
    .from("sync_status")
    .select("*")
    .eq("sync_type", "recordings")
    .order("last_sync_at", { ascending: false })
    .limit(1)
    .single();

  if (syncErr) {
    console.log("\nSync status error:", syncErr.message);
  } else {
    console.log("\nRecordings sync status:");
    console.log("  Status:", syncStatus?.status);
    console.log("  Last sync:", syncStatus?.last_sync_at);
    console.log("  Items synced:", syncStatus?.items_synced);
    console.log("  Notes:", syncStatus?.notes);
    console.log("  Last error:", syncStatus?.last_error || "none");
  }

  // Check if there are recordings with storage_backend = supabase that have no file
  const { data: badRecordings, count } = await supabase
    .from("call_recordings")
    .select("id", { count: "exact" })
    .eq("storage_backend", "supabase")
    .is("file_size", null);

  console.log("\nRecordings with missing files:");
  console.log("  Count:", count || 0);
}

main().catch(console.error);
