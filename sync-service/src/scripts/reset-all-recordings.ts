/**
 * Reset all recordings to allow fresh sync
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  console.log("=".repeat(60));
  console.log("Reset All Recordings");
  console.log("=".repeat(60));

  const supabase = getSupabaseClient();

  // Count before
  const { count: before } = await supabase
    .from("call_recordings")
    .select("*", { count: "exact", head: true });

  console.log(`\nRecordings before: ${before}`);

  // Delete all recordings (they'll be re-synced with correct data)
  const { error } = await supabase
    .from("call_recordings")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all (no-op filter)

  if (error) {
    console.error("Delete error:", error.message);
    return;
  }

  // Count after
  const { count: after } = await supabase
    .from("call_recordings")
    .select("*", { count: "exact", head: true });

  console.log(`Recordings after: ${after}`);

  // Reset sync checkpoint
  const { error: resetErr } = await supabase
    .from("sync_status")
    .update({
      last_synced_message_at: new Date("2026-01-01").toISOString(),
      notes: "Reset for fresh sync with correct data",
    })
    .eq("sync_type", "recordings");

  if (resetErr) {
    console.error("Reset checkpoint error:", resetErr.message);
  } else {
    console.log("Sync checkpoint reset to 2026-01-01");
  }

  console.log("\nDone! Run recordings sync to re-populate.");
}

main().catch(console.error);
