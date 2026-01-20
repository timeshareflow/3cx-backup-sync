import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  // Try to select conversation_id
  const { data, error } = await supabase
    .from("media_files")
    .select("id, conversation_id")
    .limit(1);

  if (error && error.message.includes("does not exist")) {
    console.log("conversation_id column does NOT exist in media_files");
    console.log("Need to add it via migration");
  } else if (error) {
    console.log("Error:", error.message);
  } else {
    console.log("conversation_id column EXISTS");
    console.log("Sample:", data);
  }

  // Check messages for comparison
  const { data: messages } = await supabase
    .from("messages")
    .select("id, sent_at, content, has_media, conversation_id")
    .eq("has_media", true)
    .order("sent_at", { ascending: false })
    .limit(5);

  console.log("\n=== Messages with media ===");
  messages?.forEach((m) => {
    console.log(`  ${m.sent_at} | ${m.content} | conv: ${m.conversation_id.slice(0, 8)}...`);
  });

  // Check media files timestamps
  const { data: media } = await supabase
    .from("media_files")
    .select("id, file_name, created_at, mime_type")
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("\n=== Media files ===");
  media?.forEach((m) => {
    console.log(`  ${m.created_at} | ${m.file_name} | ${m.mime_type}`);
  });
}

check().catch(console.error);
