/**
 * Check the call_logs table schema
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  const supabase = getSupabaseClient();

  // Get one call log to see actual columns
  const { data, error } = await supabase
    .from("call_logs")
    .select("*")
    .limit(1);

  if (error) {
    console.log("Error:", error.message);
    console.log("Code:", error.code);
    console.log("Details:", error.details);

    // Try insert with minimal data to see schema
    console.log("\nTrying to insert test record...");
    const testRecord = {
      tenant_id: "4c723c9c-a5c3-45bf-a4f4-5505e11ee3b4",
      threecx_call_id: "test-" + Date.now(),
      started_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from("call_logs")
      .insert(testRecord)
      .select();

    if (insertError) {
      console.log("\nInsert error:", insertError.message);
      console.log("Code:", insertError.code);
    }
  } else if (data && data.length > 0) {
    console.log("\nCall logs table columns:");
    for (const key of Object.keys(data[0])) {
      console.log(`  - ${key}`);
    }
  } else {
    console.log("Table exists but is empty.");
    console.log("Attempting to discover schema via insert...");

    const testRecord = {
      tenant_id: "4c723c9c-a5c3-45bf-a4f4-5505e11ee3b4",
      threecx_call_id: "test-" + Date.now(),
      started_at: new Date().toISOString(),
    };

    const { data: insertData, error: insertError } = await supabase
      .from("call_logs")
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
      await supabase.from("call_logs").delete().eq("id", insertData[0].id);
    }
  }
}

main().catch(console.error);
