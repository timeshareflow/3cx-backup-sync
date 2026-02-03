/**
 * Check data in various tables
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";

async function main() {
  const supabase = getSupabaseClient();

  // Check call_recordings
  console.log("=== Call Recordings ===");
  const { data: recordings, error: recErr, count: recCount } = await supabase
    .from("call_recordings")
    .select("id, caller_number, callee_number, direction, file_size, duration_seconds, storage_path", { count: "exact" })
    .limit(3);

  if (recErr) {
    console.log("Error:", recErr.message);
  } else {
    console.log(`Total: ${recCount} recordings`);
    console.log("Sample:", JSON.stringify(recordings, null, 2));
  }

  // Check call_logs
  console.log("\n=== Call Logs ===");
  const { data: cdr, error: cdrErr, count: cdrCount } = await supabase
    .from("call_logs")
    .select("id, caller_number, callee_number, direction, duration_seconds", { count: "exact" })
    .limit(3);

  if (cdrErr) {
    console.log("Error:", cdrErr.message);
  } else {
    console.log(`Total: ${cdrCount} call logs`);
    console.log("Sample:", JSON.stringify(cdr, null, 2));
  }

  // Check voicemails
  console.log("\n=== Voicemails ===");
  const { data: vm, error: vmErr, count: vmCount } = await supabase
    .from("voicemails")
    .select("id, caller_number, extension_number, file_size, storage_path", { count: "exact" })
    .limit(3);

  if (vmErr) {
    console.log("Error:", vmErr.message);
  } else {
    console.log(`Total: ${vmCount} voicemails`);
    console.log("Sample:", JSON.stringify(vm, null, 2));
  }

  // Check meeting_recordings
  console.log("\n=== Meeting Recordings ===");
  const { data: meetings, error: meetErr, count: meetCount } = await supabase
    .from("meeting_recordings")
    .select("id, threecx_meeting_id, file_size, storage_path", { count: "exact" })
    .limit(3);

  if (meetErr) {
    console.log("Error:", meetErr.message);
  } else {
    console.log(`Total: ${meetCount} meeting recordings`);
    console.log("Sample:", JSON.stringify(meetings, null, 2));
  }
}

main().catch(console.error);
