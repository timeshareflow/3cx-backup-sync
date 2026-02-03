/**
 * Check full recording data
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("call_recordings")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(3);

  if (error) {
    console.log("Error:", error.message);
    return;
  }

  console.log("Full recording data:\n");
  for (const rec of data || []) {
    console.log("=== Recording", rec.threecx_call_id, "===");
    for (const [key, value] of Object.entries(rec)) {
      console.log(`  ${key}: ${value === null ? "NULL" : value}`);
    }
    console.log("");
  }
}

main().catch(console.error);
