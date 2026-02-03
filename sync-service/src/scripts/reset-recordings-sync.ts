/**
 * Reset recordings sync by deleting records that have no actual files
 * This allows the sync to re-download and properly upload them
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  console.log("=".repeat(60));
  console.log("Reset Recordings Sync");
  console.log("=".repeat(60));

  const supabase = getSupabaseClient();

  // Find recordings with no file_size or file_size = 0 (meaning file wasn't uploaded)
  const { data: brokenRecordings, error: fetchErr } = await supabase
    .from("call_recordings")
    .select("id, storage_path, file_size")
    .or("file_size.is.null,file_size.eq.0");

  if (fetchErr) {
    console.error("Error fetching recordings:", fetchErr.message);
    process.exit(1);
  }

  console.log(`\nFound ${brokenRecordings?.length || 0} recordings with no file\n`);

  if (!brokenRecordings || brokenRecordings.length === 0) {
    console.log("Nothing to clean up!");
    return;
  }

  // Delete the broken records
  console.log("Deleting broken records...");

  const ids = brokenRecordings.map(r => r.id);
  const { error: deleteErr } = await supabase
    .from("call_recordings")
    .delete()
    .in("id", ids);

  if (deleteErr) {
    console.error("Error deleting records:", deleteErr.message);
    process.exit(1);
  }

  console.log(`Deleted ${ids.length} broken recording records`);

  // Reset the recordings sync checkpoint to force re-sync
  console.log("\nResetting recordings sync checkpoint...");

  const { error: resetErr } = await supabase
    .from("sync_status")
    .update({
      last_synced_message_at: null,
      notes: "Reset to re-sync recordings with proper file uploads",
    })
    .eq("sync_type", "recordings");

  if (resetErr) {
    console.error("Error resetting sync:", resetErr.message);
  } else {
    console.log("Sync checkpoint reset");
  }

  console.log("\n" + "=".repeat(60));
  console.log("Done! The next recordings sync will re-download files.");
  console.log("=".repeat(60));
}

main().catch(console.error);
