/**
 * Check actual recordings in database
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  const supabase = getSupabaseClient();

  // Get count and sample
  const { count } = await supabase
    .from("call_recordings")
    .select("*", { count: "exact", head: true });

  console.log("Total recordings:", count);

  // Get first few records
  const { data, error } = await supabase
    .from("call_recordings")
    .select("id, threecx_call_id, file_name, file_size, storage_backend, started_at")
    .order("started_at", { ascending: false })
    .limit(10);

  if (error) {
    console.log("Error:", error.message);
    return;
  }

  console.log("\nRecent recordings:");
  for (const rec of data || []) {
    console.log(`  ${rec.threecx_call_id}: ${rec.file_name} (${rec.file_size || 0} bytes, ${rec.storage_backend})`);
  }
}

main().catch(console.error);
