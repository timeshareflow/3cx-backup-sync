import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
  // Get a message with media
  const { data: message, error: msgError } = await supabase
    .from("messages")
    .select(`
      id,
      content,
      has_media,
      sent_at,
      media_files (
        id,
        file_name,
        storage_path,
        mime_type
      )
    `)
    .eq("has_media", true)
    .limit(5);

  if (msgError) {
    console.error("Error:", msgError.message);
    return;
  }

  console.log("Messages with media:");
  message?.forEach((m) => {
    console.log(`\nMessage: ${m.id.slice(0, 8)}...`);
    console.log(`  Content: ${m.content}`);
    console.log(`  has_media: ${m.has_media}`);
    console.log(`  sent_at: ${m.sent_at}`);
    console.log(`  media_files:`, m.media_files);
  });
}

test().catch(console.error);
