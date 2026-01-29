/**
 * Restore script - uploads backed-up files back to Supabase Storage.
 * Use this if re-compression caused issues.
 *
 * Usage: npx tsx scripts/restore-media.ts --backup-dir=<path>
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
const backupDirArg = args.find((a) => a.startsWith("--backup-dir="))?.split("=")[1];

if (!backupDirArg) {
  console.error("Usage: npx tsx scripts/restore-media.ts --backup-dir=<path>");
  process.exit(1);
}

const backupDir = path.resolve(backupDirArg);

interface ManifestEntry {
  id: string;
  storage_path: string;
  local_path: string;
  file_size: number | null;
  mime_type: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  console.log("=== Media Restore Script ===");
  console.log(`Backup directory: ${backupDir}\n`);

  // Load manifest
  const manifestPath = path.join(backupDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  console.log(`Found ${manifest.length} files in manifest\n`);

  let restored = 0;
  let failed = 0;

  for (const entry of manifest) {
    const localPath = path.join(backupDir, entry.local_path);

    console.log(
      `  [${restored + failed + 1}/${manifest.length}] ${entry.storage_path} (${formatBytes(entry.file_size || 0)})`
    );

    try {
      if (!fs.existsSync(localPath)) {
        throw new Error(`Local file not found: ${localPath}`);
      }

      const buffer = fs.readFileSync(localPath);

      // Delete existing file in storage first
      await supabase.storage.from(BUCKET_NAME).remove([entry.storage_path]);

      // Upload original file
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(entry.storage_path, buffer, {
          contentType: entry.mime_type || "application/octet-stream",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // Update DB record to original values
      const { error: updateError } = await supabase
        .from("media_files")
        .update({
          file_size: entry.file_size,
          mime_type: entry.mime_type,
          storage_path: entry.storage_path,
        })
        .eq("id", entry.id);

      if (updateError) {
        console.warn(`    -> Warning: DB update failed: ${updateError.message}`);
      }

      restored++;
      console.log(`    -> Restored`);
    } catch (err) {
      console.error(`    -> FAILED: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log("\n=== Restore Complete ===");
  console.log(`Restored: ${restored}`);
  console.log(`Failed: ${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  });
