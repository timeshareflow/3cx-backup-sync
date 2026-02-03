/**
 * Check voicemails table schema in Supabase
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  console.log("=".repeat(60));
  console.log("Check Voicemails Table Schema");
  console.log("=".repeat(60));

  const supabase = getSupabaseClient();

  // Get one voicemail to see actual columns
  const { data, error } = await supabase
    .from("voicemails")
    .select("*")
    .limit(1);

  if (error) {
    console.log("Error querying voicemails:", error.message);
    console.log("Code:", error.code);
    console.log("Details:", error.details);
    console.log("Hint:", error.hint);

    // Try minimal insert to see schema
    console.log("\nTrying to insert test record...");
    const testRecord = {
      tenant_id: "4c723c9c-a5c3-45bf-a4f4-5505e11ee3b4",
      extension_number: "test",
      storage_path: "test/test.wav",
      received_at: new Date().toISOString(),
    };

    const { data: insertData, error: insertError } = await supabase
      .from("voicemails")
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
      await supabase.from("voicemails").delete().eq("id", insertData[0].id);
    }
  } else if (data && data.length > 0) {
    console.log("\nVoicemails table columns:");
    for (const key of Object.keys(data[0])) {
      console.log(`  - ${key}: ${typeof data[0][key as keyof typeof data[0]]}`);
    }
  } else {
    console.log("Table exists but is empty.");

    // Try minimal insert to discover schema
    const testRecord = {
      tenant_id: "4c723c9c-a5c3-45bf-a4f4-5505e11ee3b4",
      extension_number: "test",
      storage_path: "test/test.wav",
      received_at: new Date().toISOString(),
    };

    const { data: insertData, error: insertError } = await supabase
      .from("voicemails")
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
      await supabase.from("voicemails").delete().eq("id", insertData[0].id);
    }
  }
}

main().catch(console.error);
