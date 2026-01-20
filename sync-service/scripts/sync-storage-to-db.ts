/**
 * Sync Storage to Database
 *
 * This script scans the Supabase storage bucket and creates database records
 * for any files that exist in storage but not in the database.
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const BUCKET_NAME = "backupwiz-files";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface StorageFile {
  name: string;
  id: string;
  metadata: Record<string, unknown>;
}

// Get file type from mime type
function getFileType(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

// Get mime type from extension
function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    webm: "video/webm",
    wav: "audio/wav",
    mp3: "audio/mpeg",
    pdf: "application/pdf",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

async function listStorageFiles(tenantId: string, category: string): Promise<string[]> {
  const files: string[] = [];
  const basePath = `${tenantId}/${category}`;

  try {
    // List years
    const { data: years, error: yearsError } = await supabase.storage
      .from(BUCKET_NAME)
      .list(basePath);

    if (yearsError || !years) {
      console.log(`  No files found at ${basePath}`);
      return files;
    }

    for (const year of years) {
      if (year.id) continue; // Skip if it's a file, not a folder

      const yearPath = `${basePath}/${year.name}`;
      const { data: months } = await supabase.storage
        .from(BUCKET_NAME)
        .list(yearPath);

      if (!months) continue;

      for (const month of months) {
        if (month.id) continue;

        const monthPath = `${yearPath}/${month.name}`;
        const { data: fileList } = await supabase.storage
          .from(BUCKET_NAME)
          .list(monthPath);

        if (!fileList) continue;

        for (const file of fileList) {
          if (!file.id) continue; // Skip folders
          files.push(`${monthPath}/${file.name}`);
        }
      }
    }
  } catch (error) {
    console.error(`Error listing storage files for ${basePath}:`, error);
  }

  return files;
}

async function getExistingDbPaths(tenantId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("media_files")
    .select("storage_path")
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("Error fetching existing DB paths:", error);
    return new Set();
  }

  return new Set((data || []).map((r) => r.storage_path));
}

async function createMediaRecord(
  tenantId: string,
  storagePath: string
): Promise<boolean> {
  const filename = storagePath.split("/").pop() || "unknown";
  const mimeType = getMimeType(filename);

  // Get file metadata from storage
  const { data: fileData } = await supabase.storage
    .from(BUCKET_NAME)
    .list(storagePath.substring(0, storagePath.lastIndexOf("/")), {
      search: filename,
    });

  const fileInfo = fileData?.find((f) => f.name === filename);
  const fileSize = fileInfo?.metadata?.size || 0;

  const { error } = await supabase.from("media_files").insert({
    tenant_id: tenantId,
    file_name: filename,
    storage_path: storagePath,
    mime_type: mimeType,
    file_size: fileSize,
  });

  if (error) {
    console.error(`  Failed to insert ${filename}:`, error.message);
    return false;
  }

  return true;
}

async function syncTenantMedia(tenantId: string, tenantName: string): Promise<void> {
  console.log(`\nProcessing tenant: ${tenantName} (${tenantId})`);

  // Get files from storage
  const categories = ["chat-media", "recordings", "voicemails"];
  let totalStorageFiles = 0;
  let totalDbMissing = 0;
  let totalCreated = 0;

  // Get existing DB records
  const existingPaths = await getExistingDbPaths(tenantId);
  console.log(`  Found ${existingPaths.size} existing database records`);

  for (const category of categories) {
    console.log(`  Scanning ${category}...`);
    const storageFiles = await listStorageFiles(tenantId, category);
    totalStorageFiles += storageFiles.length;

    // Find files missing from DB
    const missingFiles = storageFiles.filter((path) => !existingPaths.has(path));
    totalDbMissing += missingFiles.length;

    if (missingFiles.length > 0) {
      console.log(`    Found ${storageFiles.length} files in storage, ${missingFiles.length} missing from DB`);

      for (const path of missingFiles) {
        const success = await createMediaRecord(tenantId, path);
        if (success) {
          totalCreated++;
          console.log(`    Created record for: ${path.split("/").pop()}`);
        }
      }
    } else {
      console.log(`    ${storageFiles.length} files, all have DB records`);
    }
  }

  console.log(`  Summary: ${totalStorageFiles} storage files, ${totalDbMissing} were missing, ${totalCreated} created`);
}

async function main(): Promise<void> {
  console.log("===========================================");
  console.log("  Storage to Database Sync Script");
  console.log("===========================================\n");

  // Get all tenants
  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("is_active", true);

  if (error || !tenants) {
    console.error("Failed to fetch tenants:", error);
    return;
  }

  console.log(`Found ${tenants.length} active tenants`);

  for (const tenant of tenants) {
    await syncTenantMedia(tenant.id, tenant.name);
  }

  console.log("\n===========================================");
  console.log("  Sync Complete!");
  console.log("===========================================");
}

main().catch(console.error);
