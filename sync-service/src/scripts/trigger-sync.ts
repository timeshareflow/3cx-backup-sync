/**
 * Trigger a manual sync via the sync_status table
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  const supabase = getSupabaseClient();

  // Set trigger timestamp
  const { error } = await supabase
    .from("sync_status")
    .update({
      trigger_requested_at: new Date().toISOString(),
    })
    .eq("sync_type", "recordings");

  if (error) {
    console.error("Error triggering sync:", error.message);
  } else {
    console.log("Sync trigger set. The sync service should pick this up on next cycle.");
  }

  // Also reset the last_synced_message_at to force re-sync from beginning
  const { error: resetErr } = await supabase
    .from("sync_status")
    .update({
      last_synced_message_at: new Date("2026-01-01").toISOString(),
      notes: "Manual re-sync triggered",
    })
    .eq("sync_type", "recordings");

  if (resetErr) {
    console.error("Error resetting checkpoint:", resetErr.message);
  } else {
    console.log("Checkpoint reset to beginning.");
  }
}

main().catch(console.error);
