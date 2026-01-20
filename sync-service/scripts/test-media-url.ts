import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET_NAME = "backupwiz-files";

async function test() {
  // Get a media file
  const { data: media, error: mediaError } = await supabase
    .from("media_files")
    .select("id, file_name, storage_path, mime_type")
    .limit(3);

  if (mediaError) {
    console.error("Error fetching media:", mediaError.message);
    return;
  }

  console.log("Testing media files:\n");

  for (const m of media || []) {
    console.log(`File: ${m.file_name}`);
    console.log(`  ID: ${m.id}`);
    console.log(`  Storage path: ${m.storage_path}`);
    console.log(`  MIME type: ${m.mime_type}`);

    // Check if file exists in storage
    const pathParts = m.storage_path.split("/");
    const fileName = pathParts.pop();
    const folderPath = pathParts.join("/");

    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folderPath, { search: fileName });

    if (listError) {
      console.log(`  List error: ${listError.message}`);
    } else if (!files || files.length === 0) {
      console.log(`  FILE NOT FOUND in storage!`);
    } else {
      console.log(`  File exists in storage: ${files[0].name} (${files[0].metadata?.size} bytes)`);
    }

    // Try to generate signed URL
    const { data: signedUrl, error: urlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(m.storage_path, 3600);

    if (urlError) {
      console.log(`  Signed URL error: ${urlError.message}`);
    } else {
      console.log(`  Signed URL: ${signedUrl.signedUrl.slice(0, 80)}...`);

      // Try to fetch the URL
      try {
        const response = await fetch(signedUrl.signedUrl, { method: "HEAD" });
        console.log(`  URL status: ${response.status} ${response.statusText}`);
      } catch (fetchErr) {
        console.log(`  URL fetch error: ${(fetchErr as Error).message}`);
      }
    }

    console.log();
  }
}

test().catch(console.error);
