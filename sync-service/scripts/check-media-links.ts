import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  // Get all media files
  const { data: media, error } = await supabase
    .from("media_files")
    .select("id, file_name, storage_path, message_id, conversation_id, tenant_id, mime_type")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching media:", error);
    return;
  }

  console.log(`=== ALL MEDIA FILES (${media?.length || 0}) ===`);
  media?.forEach((m) => {
    console.log(`  ${m.file_name}`);
    console.log(`    storage: ${m.storage_path}`);
    console.log(`    message_id: ${m.message_id || "NULL"}`);
    console.log(`    conversation_id: ${m.conversation_id || "NULL"}`);
    console.log(`    mime: ${m.mime_type}`);
    console.log();
  });

  // Get messages with has_media=true
  console.log("\n=== MESSAGES WITH MEDIA ===");
  const { data: messages } = await supabase
    .from("messages")
    .select("id, content, has_media, conversation_id, sent_at")
    .eq("has_media", true)
    .order("sent_at", { ascending: false });

  messages?.forEach((m) => {
    console.log(`  Message: ${m.id.slice(0, 8)}...`);
    console.log(`    content: "${m.content}"`);
    console.log(`    conversation_id: ${m.conversation_id}`);
    console.log(`    sent_at: ${m.sent_at}`);
    console.log();
  });

  // Check which messages match which media
  console.log("\n=== CORRELATION ANALYSIS ===");
  const orphanedMedia = media?.filter((m) => !m.message_id) || [];
  console.log(`Orphaned media (no message_id): ${orphanedMedia.length}`);

  // The message content IS the filename in 3CX
  // So we need to match media.file_name or the original filename with message.content
  for (const m of orphanedMedia) {
    // Extract original filename from storage path
    const storageParts = m.storage_path.split("/");
    const storedFilename = storageParts[storageParts.length - 1];

    // Look for a message that contains this filename or the original filename
    const matchingMsg = messages?.find((msg) => {
      if (!msg.content) return false;
      const content = msg.content.toLowerCase();
      const filename = m.file_name.toLowerCase();

      // Direct match
      if (content === filename) return true;

      // Check if stored hash filename matches anything
      // Usually 3CX stores the original filename in message, but stores hash on disk
      return false;
    });

    if (matchingMsg) {
      console.log(`  MATCH: ${m.file_name} -> ${matchingMsg.id.slice(0, 8)}...`);
    } else {
      console.log(`  NO MATCH: ${m.file_name}`);
    }
  }
}

check().catch(console.error);
