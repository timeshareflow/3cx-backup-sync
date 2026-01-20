import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  // Get media files
  const { data: media } = await supabase
    .from("media_files")
    .select("id, file_name, message_id, conversation_id, storage_path")
    .limit(20);

  console.log("=== MEDIA FILES ===");
  media?.forEach((m) =>
    console.log(
      `  ${m.file_name} | msg_id: ${m.message_id || "NULL"} | conv_id: ${m.conversation_id || "NULL"}`
    )
  );

  // Get messages with has_media = true
  const { data: messages } = await supabase
    .from("messages")
    .select("id, content, has_media, conversation_id")
    .eq("has_media", true)
    .limit(20);

  console.log("\n=== MESSAGES WITH has_media=true ===");
  messages?.forEach((m) =>
    console.log(
      `  ${m.id.slice(0, 8)}... | content: ${m.content?.slice(0, 80) || "NULL"}`
    )
  );

  // Get messages that might contain filenames
  const { data: allMsgs } = await supabase
    .from("messages")
    .select("id, content, conversation_id")
    .not("content", "is", null)
    .limit(500);

  const mediaPatterns = allMsgs?.filter(
    (m) =>
      m.content &&
      (m.content.includes(".jpg") ||
        m.content.includes(".png") ||
        m.content.includes(".mp4") ||
        m.content.includes(".gif") ||
        m.content.includes("[image]") ||
        m.content.includes("[video]") ||
        m.content.match(/IMG_\d+/i) ||
        m.content.match(/VID_\d+/i))
  );

  console.log("\n=== MESSAGES WITH MEDIA PATTERNS ===");
  console.log(`Found ${mediaPatterns?.length || 0} messages with media-like content`);
  mediaPatterns?.slice(0, 15).forEach((m) =>
    console.log(`  ${m.id.slice(0, 8)}... | ${m.content?.slice(0, 120)}`)
  );

  // Check if content has specific patterns
  console.log("\n=== SAMPLE MESSAGE CONTENTS ===");
  const { data: sampleMsgs } = await supabase
    .from("messages")
    .select("content")
    .not("content", "is", null)
    .order("sent_at", { ascending: false })
    .limit(30);

  sampleMsgs?.forEach((m, i) => {
    if (m.content && m.content.length < 200) {
      console.log(`  [${i}] ${m.content}`);
    }
  });
}

check().catch(console.error);
