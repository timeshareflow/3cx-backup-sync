/**
 * Migration script to move files from Supabase Storage to DigitalOcean Spaces
 *
 * Usage:
 *   npx ts-node src/scripts/migrate-to-spaces.ts
 *
 * Environment variables required:
 *   - DO_SPACES_KEY: DigitalOcean Spaces access key
 *   - DO_SPACES_SECRET: DigitalOcean Spaces secret key
 *   - DO_SPACES_BUCKET: Bucket name
 *   - DO_SPACES_ENDPOINT: Endpoint (e.g., nyc3.digitaloceanspaces.com)
 *   - DO_SPACES_REGION: Region (e.g., nyc3)
 *   - SUPABASE_URL: Supabase project URL
 *   - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key
 */

import "dotenv/config";
import { getSupabaseClient } from "../storage/supabase";
import {
  uploadBuffer as uploadToSpaces,
  fileExists as spacesFileExists,
  isSpacesConfigured,
  getBucketName,
} from "../storage/spaces-storage";
import { logger } from "../utils/logger";

const SUPABASE_BUCKET = "backupwiz-files";

interface StorageFile {
  id: string;
  tenant_id: string;
  storage_path: string;
  file_size: number;
  mime_type?: string;
  storage_backend?: string;
  table_name: string;
}

// Tables that store files with storage_path
const TABLES_WITH_FILES = [
  { name: "media_files", pathColumn: "storage_path", mimeColumn: "mime_type" },
  { name: "call_recordings", pathColumn: "storage_path", mimeColumn: "mime_type" },
  { name: "voicemails", pathColumn: "storage_path", mimeColumn: "mime_type" },
  { name: "faxes", pathColumn: "storage_path", mimeColumn: "mime_type" },
  { name: "meeting_recordings", pathColumn: "storage_path", mimeColumn: "mime_type" },
];

async function getFilesFromTable(tableName: string): Promise<StorageFile[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from(tableName)
    .select("id, tenant_id, storage_path, file_size, mime_type, storage_backend")
    .not("storage_path", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    // Table might not exist or have different columns
    logger.warn(`Failed to get files from ${tableName}: ${error.message}`);
    return [];
  }

  return (data || []).map(row => ({
    ...row,
    table_name: tableName,
  }));
}

async function downloadFromSupabase(storagePath: string): Promise<Buffer> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .download(storagePath);

  if (error) {
    throw new Error(`Failed to download from Supabase: ${error.message}`);
  }

  // Convert blob to buffer
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function updateFileBackend(tableName: string, fileId: string, backend: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from(tableName)
    .update({ storage_backend: backend })
    .eq("id", fileId);

  if (error) {
    throw new Error(`Failed to update ${tableName} backend: ${error.message}`);
  }
}

async function migrateFile(file: StorageFile): Promise<{ success: boolean; skipped: boolean }> {
  try {
    // Skip if already migrated
    if (file.storage_backend === "spaces") {
      return { success: true, skipped: true };
    }

    // Skip if no storage path
    if (!file.storage_path) {
      return { success: true, skipped: true };
    }

    // Check if file already exists in Spaces
    const existsInSpaces = await spacesFileExists(file.storage_path);
    if (existsInSpaces) {
      // Just update the backend marker
      await updateFileBackend(file.table_name, file.id, "spaces");
      logger.debug(`File already in Spaces, marked as migrated: ${file.storage_path}`);
      return { success: true, skipped: false };
    }

    // Download from Supabase
    logger.debug(`Downloading from Supabase: ${file.storage_path}`);
    const buffer = await downloadFromSupabase(file.storage_path);

    // Upload to Spaces
    const mimeType = file.mime_type || "application/octet-stream";
    logger.debug(`Uploading to DO Spaces: ${file.storage_path}`);
    await uploadToSpaces(buffer, file.storage_path, mimeType);

    // Update the database to mark as migrated
    await updateFileBackend(file.table_name, file.id, "spaces");

    const sizeKB = (file.file_size || buffer.length) / 1024;
    logger.info(`Migrated [${file.table_name}]: ${file.storage_path} (${sizeKB.toFixed(1)}KB)`);
    return { success: true, skipped: false };
  } catch (error) {
    logger.error(`Failed to migrate file: ${file.storage_path}`, {
      table: file.table_name,
      error: (error as Error).message,
    });
    return { success: false, skipped: false };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Supabase → DO Spaces Migration Script");
  console.log("=".repeat(60));

  // Check configuration
  if (!isSpacesConfigured()) {
    console.error("\nError: DO Spaces is not configured.");
    console.error("Please set the following environment variables:");
    console.error("  - DO_SPACES_KEY");
    console.error("  - DO_SPACES_SECRET");
    console.error("  - DO_SPACES_BUCKET");
    console.error("  - DO_SPACES_ENDPOINT");
    console.error("  - DO_SPACES_REGION");
    process.exit(1);
  }

  console.log(`\nTarget bucket: ${getBucketName()}`);

  // Get all files from all tables
  console.log("\nFetching files from all tables...");
  const allFiles: StorageFile[] = [];

  for (const table of TABLES_WITH_FILES) {
    console.log(`  Checking ${table.name}...`);
    const files = await getFilesFromTable(table.name);
    console.log(`    Found ${files.length} files`);
    allFiles.push(...files);
  }

  console.log(`\nTotal files in database: ${allFiles.length}`);

  // Filter files that haven't been migrated
  const toMigrate = allFiles.filter(f => f.storage_backend !== "spaces");
  console.log(`Files to migrate: ${toMigrate.length}`);

  if (toMigrate.length === 0) {
    console.log("\n✅ All files have already been migrated!");
    return;
  }

  // Group by table for summary
  const byTable: Record<string, number> = {};
  for (const file of toMigrate) {
    byTable[file.table_name] = (byTable[file.table_name] || 0) + 1;
  }
  console.log("\nFiles to migrate by table:");
  for (const [table, count] of Object.entries(byTable)) {
    console.log(`  ${table}: ${count}`);
  }

  // Calculate total size
  const totalSize = toMigrate.reduce((sum, f) => sum + (f.file_size || 0), 0);
  console.log(`\nTotal size to migrate: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);

  // Start migration
  console.log("\n" + "=".repeat(60));
  console.log("Starting migration...");
  console.log("=".repeat(60) + "\n");

  let migrated = 0;
  let failed = 0;
  let skipped = 0;
  const startTime = Date.now();

  for (let i = 0; i < toMigrate.length; i++) {
    const file = toMigrate[i];
    const result = await migrateFile(file);

    if (result.skipped) {
      skipped++;
    } else if (result.success) {
      migrated++;
    } else {
      failed++;
    }

    // Progress update every 10 files or at the end
    if ((i + 1) % 10 === 0 || i === toMigrate.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`Progress: ${i + 1}/${toMigrate.length} | Migrated: ${migrated} | Failed: ${failed} | Time: ${elapsed}s`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(60));
  console.log("Migration Complete!");
  console.log("=".repeat(60));
  console.log(`  ✅ Migrated: ${migrated}`);
  console.log(`  ⏭️  Skipped (already migrated): ${skipped}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  ⏱️  Total time: ${totalTime}s`);

  if (failed > 0) {
    console.log("\n⚠️  Some files failed to migrate. Check the logs for details.");
    process.exit(1);
  } else {
    console.log("\n🎉 All files successfully migrated to DO Spaces!");
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
