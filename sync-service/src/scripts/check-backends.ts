import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("call_recordings")
    .select("storage_backend, file_size");

  if (error) {
    console.log("Error:", error.message);
    return;
  }

  const counts: Record<string, { count: number; withSize: number; withoutSize: number }> = {};

  for (const r of data || []) {
    const backend = r.storage_backend || "null";
    if (!counts[backend]) {
      counts[backend] = { count: 0, withSize: 0, withoutSize: 0 };
    }
    counts[backend].count++;
    if (r.file_size) {
      counts[backend].withSize++;
    } else {
      counts[backend].withoutSize++;
    }
  }

  console.log("Recording storage backends:");
  console.log("=".repeat(60));
  for (const [backend, stats] of Object.entries(counts)) {
    console.log(`${backend}: ${stats.count} total (${stats.withSize} with size, ${stats.withoutSize} without)`);
  }
}

main().catch(console.error);
