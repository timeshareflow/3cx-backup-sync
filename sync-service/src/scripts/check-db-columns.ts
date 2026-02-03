/**
 * Check actual database columns for call_recordings
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  console.log("=".repeat(60));
  console.log("Check Database Columns");
  console.log("=".repeat(60));

  const supabase = getSupabaseClient();

  // Get one recording to see actual columns
  const { data, error } = await supabase
    .from("call_recordings")
    .select("*")
    .limit(1);

  if (error) {
    console.log("Error querying call_recordings:", error.message);
    console.log("Error details:", error.details);
    console.log("Error hint:", error.hint);

    // Try to get column info from Supabase schema
    console.log("\nTrying to get table info...");
  } else if (data && data.length > 0) {
    console.log("\nColumns in call_recordings table:");
    for (const key of Object.keys(data[0])) {
      console.log(`  - ${key}: ${typeof data[0][key]} = ${JSON.stringify(data[0][key])}`);
    }
  } else {
    console.log("\nNo records in call_recordings table.");
    console.log("Will try inserting a test record to see which columns fail...");

    // Try inserting with minimal columns to see what exists
    const testRecord = {
      tenant_id: "4c723c9c-a5c3-45bf-a4f4-5505e11ee3b4",
      storage_path: "test/test.wav",
      recorded_at: new Date().toISOString(),
    };

    const { data: insertData, error: insertError } = await supabase
      .from("call_recordings")
      .insert(testRecord)
      .select();

    if (insertError) {
      console.log("\nInsert error:", insertError.message);
      console.log("Details:", insertError.details);
    } else {
      console.log("\nInserted successfully with columns:", Object.keys(testRecord).join(", "));
      // Delete the test record
      if (insertData && insertData[0]) {
        await supabase.from("call_recordings").delete().eq("id", insertData[0].id);
        console.log("Test record deleted.");
      }
    }
  }

  // Also check voicemails table
  console.log("\n\n=== voicemails table ===");
  const { data: vmData, error: vmError } = await supabase
    .from("voicemails")
    .select("*")
    .limit(1);

  if (vmError) {
    console.log("Error:", vmError.message);
  } else if (vmData && vmData.length > 0) {
    console.log("Columns:");
    for (const key of Object.keys(vmData[0])) {
      console.log(`  - ${key}`);
    }
  } else {
    console.log("No records in voicemails table.");
  }

  // Check call_logs table
  console.log("\n\n=== call_logs table ===");
  const { data: clData, error: clError } = await supabase
    .from("call_logs")
    .select("*")
    .limit(1);

  if (clError) {
    console.log("Error:", clError.message);
  } else if (clData && clData.length > 0) {
    console.log("Columns:");
    for (const key of Object.keys(clData[0])) {
      console.log(`  - ${key}`);
    }
  } else {
    console.log("No records in call_logs table.");
  }
}

main().catch(console.error);
