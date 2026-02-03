/**
 * Fix file_size for call recordings that have NULL values
 * Looks up the actual file size from DO Spaces
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

const SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT || "nyc3.digitaloceanspaces.com";
const SPACES_REGION = process.env.DO_SPACES_REGION || "nyc3";
const SPACES_BUCKET = process.env.DO_SPACES_BUCKET || "3cxbackupwiz";
const SPACES_KEY = process.env.DO_SPACES_KEY || "";
const SPACES_SECRET = process.env.DO_SPACES_SECRET || "";

const s3Client = new S3Client({
  endpoint: `https://${SPACES_ENDPOINT}`,
  region: SPACES_REGION,
  credentials: {
    accessKeyId: SPACES_KEY,
    secretAccessKey: SPACES_SECRET,
  },
  forcePathStyle: false,
});

async function getFileSize(storagePath: string): Promise<number | null> {
  try {
    const command = new HeadObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: storagePath,
    });
    const response = await s3Client.send(command);
    return response.ContentLength || null;
  } catch (error) {
    console.log(`  File not found: ${storagePath}`);
    return null;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Fix Recording File Sizes");
  console.log("=".repeat(60));

  const supabase = getSupabaseClient();

  // Get recordings with null file_size
  const { data: recordings, error } = await supabase
    .from("call_recordings")
    .select("id, storage_path, file_size")
    .is("file_size", null);

  if (error) {
    console.error("Error fetching recordings:", error.message);
    process.exit(1);
  }

  console.log(`\nFound ${recordings?.length || 0} recordings with null file_size\n`);

  if (!recordings || recordings.length === 0) {
    console.log("Nothing to fix!");
    return;
  }

  let fixed = 0;
  let notFound = 0;

  for (const recording of recordings) {
    const size = await getFileSize(recording.storage_path);

    if (size) {
      const { error: updateError } = await supabase
        .from("call_recordings")
        .update({ file_size: size })
        .eq("id", recording.id);

      if (updateError) {
        console.log(`  Error updating ${recording.id}: ${updateError.message}`);
      } else {
        console.log(`  Fixed: ${recording.storage_path} (${(size / 1024).toFixed(1)} KB)`);
        fixed++;
      }
    } else {
      notFound++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Fixed: ${fixed}`);
  console.log(`Not found in storage: ${notFound}`);
  console.log("=".repeat(60));
}

main().catch(console.error);
