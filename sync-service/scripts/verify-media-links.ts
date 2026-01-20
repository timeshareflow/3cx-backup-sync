import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verify() {
  // Count total and linked
  const { data: all } = await supabase
    .from("media_files")
    .select("id, file_name, message_id, storage_path");

  const total = all?.length || 0;
  const linked = all?.filter((m) => m.message_id).length || 0;
  const unlinked = all?.filter((m) => !m.message_id) || [];

  console.log(`Total media files: ${total}`);
  console.log(`Linked to messages: ${linked}`);
  console.log(`Unlinked: ${unlinked.length}`);

  if (unlinked.length > 0) {
    console.log("\nUnlinked files:");
    unlinked.forEach((m) => console.log(`  ${m.file_name} | ${m.storage_path}`));
  }

  // Show a sample of linked files
  console.log("\nSample linked files:");
  all?.filter((m) => m.message_id).slice(0, 5).forEach((m) => {
    console.log(`  ${m.file_name} -> ${m.message_id?.slice(0, 8)}...`);
  });
}

verify().catch(console.error);
