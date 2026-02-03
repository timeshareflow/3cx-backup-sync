/**
 * Check meeting_recordings table schema
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  const supabase = getSupabaseClient();

  // Get one meeting to see actual columns
  const { data, error } = await supabase
    .from("meeting_recordings")
    .select("*")
    .limit(1);

  if (error) {
    console.log("Error querying meeting_recordings:", error.message);
    console.log("Code:", error.code);
    console.log("Details:", error.details);
    console.log("Hint:", error.hint);
  } else if (data && data.length > 0) {
    console.log("meeting_recordings table columns:");
    for (const key of Object.keys(data[0])) {
      console.log(`  - ${key}`);
    }
  } else {
    console.log("Table exists but is empty.");

    // Try minimal insert to see schema
    const testRecord = {
      tenant_id: "4c723c9c-a5c3-45bf-a4f4-5505e11ee3b4",
      storage_path: "test/test.mp4",
    };

    const { data: insertData, error: insertError } = await supabase
      .from("meeting_recordings")
      .insert(testRecord)
      .select();

    if (insertError) {
      console.log("\nInsert error:", insertError.message);
      console.log("Code:", insertError.code);
      console.log("Hint:", insertError.hint);
    } else if (insertData) {
      console.log("\nInserted successfully! Columns:");
      for (const key of Object.keys(insertData[0])) {
        console.log(`  - ${key}`);
      }
      // Clean up
      await supabase.from("meeting_recordings").delete().eq("id", insertData[0].id);
    }
  }
}

main().catch(console.error);
