/**
 * Re-compression script for existing media files in Supabase Storage.
 * Downloads each file, compresses it, re-uploads, and updates the DB record.
 *
 * Requires FFmpeg for video/audio compression.
 * Run: npx tsx scripts/recompress-media.ts [--dry-run] [--type video|image|all]
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import {
  compressImage,
  compressVideo,
  DEFAULT_COMPRESSION_SETTINGS,
} from "../src/utils/compression";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
// Also try the main project .env.local
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
const dryRun = args.includes("--dry-run");
const typeFilter = args.find((a) => a.startsWith("--type="))?.split("=")[1] || "all";

interface MediaFile {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
}

function getFileCategory(mimeType: string | null): "image" | "video" | "audio" | "other" {
  if (!mimeType) return "other";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "other";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadFromStorage(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(storagePath);

  if (error) throw new Error(`Download failed: ${error.message}`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadToStorage(
  buffer: Buffer,
  storagePath: string,
  contentType: string
): Promise<void> {
  // Delete existing file first, then upload
  await supabase.storage.from(BUCKET_NAME).remove([storagePath]);

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Upload failed: ${error.message}`);
}

async function main() {
  console.log("=== Media Re-compression Script ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Type filter: ${typeFilter}\n`);

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

  // Filter by type
  const filesToProcess = (mediaFiles as MediaFile[]).filter((f) => {
    const category = getFileCategory(f.mime_type);
    if (typeFilter === "all") return category === "video" || category === "image";
    return category === typeFilter;
  });

  console.log(`Found ${filesToProcess.length} files to process\n`);

  let totalOriginal = 0;
  let totalCompressed = 0;
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of filesToProcess) {
    const category = getFileCategory(file.mime_type);
    const originalSize = file.file_size || 0;
    totalOriginal += originalSize;

    // Skip small files (< 100KB for images, < 500KB for videos)
    const minSize = category === "video" ? 500 * 1024 : 100 * 1024;
    if (originalSize < minSize) {
      console.log(`  SKIP ${file.file_name} (${formatBytes(originalSize)}) - too small`);
      totalCompressed += originalSize;
      skipped++;
      continue;
    }

    // Skip already-compressed WebP images
    if (file.mime_type === "image/webp") {
      console.log(`  SKIP ${file.file_name} (${formatBytes(originalSize)}) - already WebP`);
      totalCompressed += originalSize;
      skipped++;
      continue;
    }

    // Skip already-compressed MP4 videos under 2MB
    if (file.mime_type === "video/mp4" && originalSize < 2 * 1024 * 1024) {
      console.log(`  SKIP ${file.file_name} (${formatBytes(originalSize)}) - small MP4`);
      totalCompressed += originalSize;
      skipped++;
      continue;
    }

    console.log(
      `  [${processed + skipped + failed + 1}/${filesToProcess.length}] ${file.file_name} ` +
        `(${formatBytes(originalSize)}, ${file.mime_type})`
    );

    if (dryRun) {
      // Estimate compression for dry run
      const estimatedRatio = category === "video" ? 0.7 : 0.6;
      const estimated = Math.round(originalSize * (1 - estimatedRatio));
      totalCompressed += estimated;
      console.log(`    -> Would compress to ~${formatBytes(estimated)} (est. ${Math.round(estimatedRatio * 100)}% savings)`);
      processed++;
      continue;
    }

    try {
      // Download
      const buffer = await downloadFromStorage(file.storage_path);

      let result;
      let newStoragePath = file.storage_path;

      if (category === "image") {
        result = await compressImage(buffer, DEFAULT_COMPRESSION_SETTINGS);
        if (result.wasCompressed && result.newExtension !== path.extname(file.storage_path).slice(1)) {
          newStoragePath = file.storage_path.replace(/\.[^.]+$/, `.${result.newExtension}`);
        }
      } else if (category === "video") {
        const ext = path.extname(file.storage_path).slice(1) || "mp4";
        result = await compressVideo(buffer, ext, DEFAULT_COMPRESSION_SETTINGS);
        if (result.wasCompressed && result.newExtension !== ext) {
          newStoragePath = file.storage_path.replace(/\.[^.]+$/, `.${result.newExtension}`);
        }
      } else {
        totalCompressed += originalSize;
        skipped++;
        continue;
      }

      if (!result.wasCompressed || result.compressionRatio < 5) {
        console.log(`    -> Compression not beneficial (${result.compressionRatio.toFixed(1)}%), keeping original`);
        totalCompressed += originalSize;
        skipped++;
        continue;
      }

      // Upload compressed version
      await uploadToStorage(result.buffer, newStoragePath, result.newMimeType);

      // If path changed, delete the old file
      if (newStoragePath !== file.storage_path) {
        await supabase.storage.from(BUCKET_NAME).remove([file.storage_path]);
      }

      // Update DB record
      const { error: updateError } = await supabase
        .from("media_files")
        .update({
          file_size: result.compressedSize,
          mime_type: result.newMimeType,
          storage_path: newStoragePath,
        })
        .eq("id", file.id);

      if (updateError) {
        console.error(`    -> DB update failed: ${updateError.message}`);
      }

      totalCompressed += result.compressedSize;
      processed++;
      const savings = ((1 - result.compressedSize / originalSize) * 100).toFixed(1);
      console.log(
        `    -> ${formatBytes(originalSize)} -> ${formatBytes(result.compressedSize)} ` +
          `(${savings}% savings)`
      );
    } catch (err) {
      console.error(`    -> FAILED: ${(err as Error).message}`);
      totalCompressed += originalSize;
      failed++;
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Processed: ${processed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Original total: ${formatBytes(totalOriginal)}`);
  console.log(`After compression: ${formatBytes(totalCompressed)}`);
  console.log(`Total savings: ${formatBytes(totalOriginal - totalCompressed)} (${((1 - totalCompressed / totalOriginal) * 100).toFixed(1)}%)`);
  if (dryRun) {
    console.log("\n(DRY RUN - no files were modified)");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  });
