/**
 * Fix recording metadata by parsing filenames
 * This updates existing recordings that have NULL caller/callee data
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

interface ParsedFilename {
  extensionName: string | null;
  extensionNumber: string | null;
  phoneNumber: string | null;
  callerNumber: string | null;
  calleeNumber: string | null;
  callerName: string | null;
  direction: "inbound" | "outbound" | "internal" | null;
}

function parseRecordingFilename(filename: string): ParsedFilename {
  const result: ParsedFilename = {
    extensionName: null,
    extensionNumber: null,
    phoneNumber: null,
    callerNumber: null,
    calleeNumber: null,
    callerName: null,
    direction: null,
  };

  // Pattern: [Extension Name]_ExtNumber-PhoneNumber_DateTime(ID).wav
  const match = filename.match(/^\[([^\]]+)\]_(\d+)-([^_]+)_\d+\(\d+\)/);

  if (!match) {
    // Try alternate pattern without brackets: ExtNumber-PhoneNumber_DateTime.wav
    const altMatch = filename.match(/^(\d+)-([^_]+)_\d+/);
    if (altMatch) {
      result.extensionNumber = altMatch[1];
      result.phoneNumber = altMatch[2];
    }
    return result;
  }

  result.extensionName = match[1];
  result.extensionNumber = match[2];
  result.phoneNumber = match[3];

  const isPhoneExtension = /^\d{2,4}$/.test(result.phoneNumber);
  const isPhoneExternal = result.phoneNumber.length >= 10 || result.phoneNumber.startsWith("+");

  if (isPhoneExtension) {
    result.direction = "internal";
    result.callerNumber = result.extensionNumber;
    result.calleeNumber = result.phoneNumber;
    result.callerName = result.extensionName;
  } else if (isPhoneExternal) {
    result.direction = "outbound";
    result.callerNumber = result.extensionNumber;
    result.callerName = result.extensionName;
    result.calleeNumber = result.phoneNumber;
  }

  return result;
}

async function main() {
  console.log("=".repeat(60));
  console.log("Fix Recording Metadata");
  console.log("=".repeat(60));

  const supabase = getSupabaseClient();

  // Get all recordings that are missing caller/callee data
  const { data: recordings, error } = await supabase
    .from("call_recordings")
    .select("id, file_name, caller_number, callee_number, direction")
    .or("caller_number.is.null,callee_number.is.null,direction.is.null");

  if (error) {
    console.error("Error fetching recordings:", error.message);
    process.exit(1);
  }

  if (!recordings || recordings.length === 0) {
    console.log("No recordings need updating.");
    process.exit(0);
  }

  console.log(`Found ${recordings.length} recordings to update\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const recording of recordings) {
    const filename = recording.file_name;
    if (!filename) {
      skipped++;
      continue;
    }

    const parsed = parseRecordingFilename(filename);

    if (!parsed.callerNumber && !parsed.calleeNumber && !parsed.direction) {
      console.log(`  Skipped: ${filename} (could not parse)`);
      skipped++;
      continue;
    }

    // Build update object only for null fields
    const updateData: Record<string, string | null> = {};

    if (!recording.caller_number && parsed.callerNumber) {
      updateData.caller_number = parsed.callerNumber;
    }
    if (!recording.callee_number && parsed.calleeNumber) {
      updateData.callee_number = parsed.calleeNumber;
    }
    if (!recording.direction && parsed.direction) {
      updateData.direction = parsed.direction;
    }
    if (parsed.callerName) {
      updateData.caller_name = parsed.callerName;
    }

    if (Object.keys(updateData).length === 0) {
      skipped++;
      continue;
    }

    const { error: updateError } = await supabase
      .from("call_recordings")
      .update(updateData)
      .eq("id", recording.id);

    if (updateError) {
      console.log(`  Failed: ${filename} - ${updateError.message}`);
      failed++;
    } else {
      console.log(`  Updated: ${filename}`);
      console.log(`    Caller: ${updateData.caller_number || "(unchanged)"} (${updateData.caller_name || ""})`);
      console.log(`    Callee: ${updateData.callee_number || "(unchanged)"}`);
      console.log(`    Direction: ${updateData.direction || "(unchanged)"}`);
      updated++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed: ${failed}`);
  console.log("=".repeat(60));

  process.exit(0);
}

main().catch(console.error);
