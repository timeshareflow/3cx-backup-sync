/**
 * Backup script - downloads all media files from Supabase Storage to local disk.
 * Run this BEFORE re-compression to have a restore point.
 *
 * Usage: npx tsx scripts/backup-media.ts [--output-dir <path>]
 * Default output: ./media-backup-{timestamp}/
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = "backupwiz-files";

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Parse CLI args
const args = process.argv.slice(2);
const outputDirArg = args.find((a) => a.startsWith("--output-dir="))?.split("=")[1];
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupDir = outputDirArg || path.resolve(__dirname, `../media-backup-${timestamp}`);

interface MediaFile {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  console.log("=== Media Backup Script ===");
  console.log(`Backup directory: ${backupDir}\n`);

  // Create backup directory
  fs.mkdirSync(backupDir, { recursive: true });

  // Fetch all media files
  const { data: mediaFiles, error } = await supabase
    .from("media_files")
    .select("id, file_name, storage_path, mime_type, file_size")
    .order("file_size", { ascending: false });

  if (error) {
    console.error("Failed to fetch media files:", error.message);
    process.exit(1);
  }

  if (!mediaFiles || mediaFiles.length === 0) {
    console.log("No media files found.");
    return;
  }

  console.log(`Found ${mediaFiles.length} files to backup\n`);

  // Save manifest file for restore
  const manifest: Array<{
    id: string;
    storage_path: string;
    local_path: string;
    file_size: number | null;
    mime_type: string | null;
  }> = [];

  let downloaded = 0;
  let failed = 0;
  let totalSize = 0;

  for (const file of mediaFiles as MediaFile[]) {
    const localPath = path.join(backupDir, file.storage_path);
    const localDir = path.dirname(localPath);

    console.log(
      `  [${downloaded + failed + 1}/${mediaFiles.length}] ${file.file_name} (${formatBytes(file.file_size || 0)})`
    );

    try {
      // Create directory structure
      fs.mkdirSync(localDir, { recursive: true });

      // Download from Supabase
      const { data, error: downloadError } = await supabase.storage
        .from(BUCKET_NAME)
        .download(file.storage_path);

      if (downloadError) {
        throw new Error(downloadError.message);
      }

      // Save to disk
      const buffer = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(localPath, buffer);

      manifest.push({
        id: file.id,
        storage_path: file.storage_path,
        local_path: file.storage_path, // relative path in backup
        file_size: file.file_size,
        mime_type: file.mime_type,
      });

      totalSize += file.file_size || 0;
      downloaded++;
      console.log(`    -> Saved`);
    } catch (err) {
      console.error(`    -> FAILED: ${(err as Error).message}`);
      failed++;
    }
  }

  // Save manifest
  const manifestPath = path.join(backupDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log("\n=== Backup Complete ===");
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total size: ${formatBytes(totalSize)}`);
  console.log(`Backup location: ${backupDir}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`\nTo restore, run: npx tsx scripts/restore-media.ts --backup-dir="${backupDir}"`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  });
