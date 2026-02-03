/**
 * Check sync status timestamps to understand what's happening
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  console.log("=".repeat(60));
  console.log("Sync Timestamps Check");
  console.log("=".repeat(60));

  const supabase = getSupabaseClient();

  // Get all sync status records
  const { data: syncStatuses, error } = await supabase
    .from("sync_status")
    .select("*")
    .order("sync_type");

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  console.log("\n=== All Sync Status Records ===\n");

  for (const status of syncStatuses || []) {
    console.log(`--- ${status.sync_type} ---`);
    console.log(`  Status: ${status.status}`);
    console.log(`  Last sync at: ${status.last_sync_at || "never"}`);
    console.log(`  Last synced message at: ${status.last_synced_message_at || "null (sync from beginning)"}`);
    console.log(`  Items synced: ${status.items_synced || 0}`);
    console.log(`  Notes: ${status.notes || "none"}`);
    console.log(`  Last error: ${status.last_error || "none"}`);
    console.log(`  Trigger requested at: ${status.trigger_requested_at || "none"}`);
    console.log("");
  }

  // Check existing recordings in our database
  console.log("=== Existing Recordings in Our Database ===");
  const { count: recordingCount, error: countError } = await supabase
    .from("call_recordings")
    .select("*", { count: "exact", head: true });

  if (countError) {
    console.error("Error counting recordings:", countError.message);
  } else {
    console.log(`Total recordings in backup database: ${recordingCount}`);
  }

  // Get sample recordings if any
  const { data: existingRecordings } = await supabase
    .from("call_recordings")
    .select("id, threecx_recording_id, recorded_at, file_size, storage_backend")
    .order("recorded_at", { ascending: false })
    .limit(5);

  if (existingRecordings && existingRecordings.length > 0) {
    console.log("\nSample existing recordings:");
    for (const rec of existingRecordings) {
      console.log(`  - ID: ${rec.threecx_recording_id}, Date: ${rec.recorded_at}, Size: ${rec.file_size || 0} bytes, Backend: ${rec.storage_backend}`);
    }
  } else {
    console.log("\nNo recordings in backup database yet.");
  }
}

main().catch(console.error);
