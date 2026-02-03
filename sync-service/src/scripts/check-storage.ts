/**
 * Check storage breakdown by backend
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  const supabase = getSupabaseClient();

  console.log("Fetching media files...");

  const { data: mediaFiles, error } = await supabase
    .from("media_files")
    .select("storage_backend, file_size");

  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }

  const stats: Record<string, { count: number; size: number }> = {};

  for (const file of mediaFiles || []) {
    const backend = file.storage_backend || "supabase";
    if (!stats[backend]) stats[backend] = { count: 0, size: 0 };
    stats[backend].count++;
    stats[backend].size += file.file_size || 0;
  }

  console.log("\nMedia Files Storage Breakdown:");
  console.log("=".repeat(50));

  for (const [backend, data] of Object.entries(stats)) {
    const sizeMB = (data.size / 1024 / 1024).toFixed(2);
    console.log(`${backend.padEnd(15)}: ${data.count} files, ${sizeMB} MB`);
  }

  const totalCount = Object.values(stats).reduce((sum, d) => sum + d.count, 0);
  const totalMB = Object.values(stats).reduce((sum, d) => sum + d.size, 0) / 1024 / 1024;

  console.log("=".repeat(50));
  console.log(`${"Total".padEnd(15)}: ${totalCount} files, ${totalMB.toFixed(2)} MB`);
}

main().catch(console.error);
