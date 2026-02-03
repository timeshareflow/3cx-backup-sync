/**
 * Quick script to check sync status
 * Usage: npx ts-node src/scripts/check-sync-status.ts
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  const supabase = getSupabaseClient();

  console.log("Checking sync status...\n");

  const { data, error } = await supabase
    .from("sync_status")
    .select("sync_type, status, last_sync_at, items_synced, notes, tenant_id")
    .order("last_sync_at", { ascending: false, nullsFirst: false })
    .limit(15);

  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }

  console.log("Recent Sync Activity:");
  console.log("=".repeat(90));
  console.log("Type            | Status     | Last Sync      | Records | Notes");
  console.log("-".repeat(90));

  for (const row of data || []) {
    const lastSync = row.last_sync_at ? new Date(row.last_sync_at) : null;
    const ago = lastSync ? Math.round((Date.now() - lastSync.getTime()) / 1000) : null;
    let agoStr = "never";
    if (ago !== null) {
      if (ago < 60) agoStr = `${ago}s ago`;
      else if (ago < 3600) agoStr = `${Math.round(ago / 60)}m ago`;
      else if (ago < 86400) agoStr = `${Math.round(ago / 3600)}h ago`;
      else agoStr = `${Math.round(ago / 86400)}d ago`;
    }

    const syncType = (row.sync_type || "unknown").padEnd(15);
    const status = (row.status || "unknown").padEnd(10);
    const records = String(row.items_synced || 0).padStart(7);
    const notes = (row.notes || "").substring(0, 30);

    console.log(`${syncType} | ${status} | ${agoStr.padEnd(14)} | ${records} | ${notes}`);
  }

  console.log("\n" + "=".repeat(90));
}

main().catch(console.error);
