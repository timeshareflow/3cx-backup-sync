/**
 * Test syncing a single recording to understand the failure point
 */

import "dotenv/config";
import * as path from "path";
import { getActiveTenants, getTenantPool, getTenantSftpConfig } from "../tenant";
import { getRecordings } from "../threecx/queries";
import { createSftpClient, closeSftpClient, getRemoteFileSize } from "../storage/sftp";
import { fileExists, generateStoragePath } from "../storage/spaces-storage";

const DEFAULT_RECORDINGS_BASE = "/var/lib/3cxpbx/Instance1/Data/Recordings";

// Same function as in recordings.ts
function urlToFilesystemPath(recordingUrl: string, basePath: string): string {
  let urlPath = recordingUrl;
  if (urlPath.startsWith("http://") || urlPath.startsWith("https://")) {
    try {
      const url = new URL(urlPath);
      urlPath = url.pathname;
    } catch {
      // If parsing fails, just use as-is
    }
  }

  if (urlPath.startsWith(basePath)) {
    return urlPath;
  }

  if (urlPath.startsWith("/")) {
    const parts = urlPath.split("/").filter(Boolean);
    const extIndex = parts.findIndex(p => /^\d{3,4}$/.test(p));
    if (extIndex !== -1) {
      const relevantParts = parts.slice(extIndex);
      return path.posix.join(basePath, ...relevantParts);
    }
    const filename = parts[parts.length - 1];
    return path.posix.join(basePath, filename);
  }

  return path.posix.join(basePath, urlPath);
}

async function main() {
  console.log("=".repeat(60));
  console.log("Test Single Recording Sync");
  console.log("=".repeat(60));

  const tenants = await getActiveTenants();
  const tenant = tenants[0];
  console.log("\nTenant:", tenant.name);

  const pool = await getTenantPool(tenant);
  if (!pool) {
    console.error("Failed to get pool!");
    process.exit(1);
  }

  const recordingsBasePath = tenant.threecx_recordings_path || DEFAULT_RECORDINGS_BASE;
  console.log("Recordings base path:", recordingsBasePath);

  // Get one recording
  const recordings = await getRecordings(new Date("2026-01-01"), 1, pool);
  if (recordings.length === 0) {
    console.log("No recordings found!");
    await pool.end();
    process.exit(1);
  }

  const recording = recordings[0];
  console.log("\n=== Recording Details ===");
  console.log("  ID:", recording.recording_id);
  console.log("  URL:", recording.recording_url);
  console.log("  Start:", recording.start_time);

  if (!recording.recording_url) {
    console.log("Recording has no URL!");
    await pool.end();
    process.exit(1);
  }

  // Convert URL to filesystem path
  const remotePath = urlToFilesystemPath(recording.recording_url, recordingsBasePath);
  const filename = path.posix.basename(remotePath) || `recording_${recording.recording_id}.wav`;
  console.log("\n=== Path Conversion ===");
  console.log("  Original URL:", recording.recording_url);
  console.log("  Converted path:", remotePath);
  console.log("  Filename:", filename);

  // Generate storage path
  const storagePath = generateStoragePath(tenant.id, "recordings", filename);
  console.log("  Storage path:", storagePath);

  // Check if exists in storage
  const existsInStorage = await fileExists(storagePath);
  console.log("\n=== Storage Check ===");
  console.log("  Exists in storage:", existsInStorage);

  // Check if exists in database
  const { recordingExists } = await import("../storage/supabase");
  const existsInDb = await recordingExists(tenant.id, recording.recording_id);
  console.log("  Exists in DB:", existsInDb);

  if (existsInDb) {
    console.log("\n⚠️ Recording already exists in database - would be skipped");
  }

  // Get SFTP config
  const sftpConfig = getTenantSftpConfig(tenant);
  if (!sftpConfig) {
    console.log("No SFTP config!");
    await pool.end();
    process.exit(1);
  }

  // Try to find the file via SFTP
  console.log("\n=== SFTP File Check ===");
  let sftp;
  try {
    sftp = await createSftpClient(sftpConfig);
    console.log("  SFTP connected");

    // Check if file exists at converted path
    const fileSize = await getRemoteFileSize(sftp, remotePath);
    console.log(`  File at ${remotePath}: ${fileSize >= 0 ? `exists (${fileSize} bytes)` : "NOT FOUND"}`);

    if (fileSize < 0) {
      // Try alternate paths
      console.log("\n  Trying alternate paths...");
      const altPaths = [
        path.posix.join(recordingsBasePath, recording.extension_number || "", "Recordings", filename),
        path.posix.join(recordingsBasePath, recording.extension_number || "", filename),
        path.posix.join(recordingsBasePath, filename),
      ];

      for (const altPath of altPaths) {
        if (altPath === remotePath) continue;
        const altSize = await getRemoteFileSize(sftp, altPath);
        console.log(`    ${altPath}: ${altSize >= 0 ? `exists (${altSize} bytes)` : "NOT FOUND"}`);
      }

      // List directory to see what's actually there
      console.log("\n  Listing directory:", recordingsBasePath);
      try {
        const files = await sftp.list(recordingsBasePath);
        console.log(`  Found ${files.length} items:`);
        for (const file of files.slice(0, 10)) {
          console.log(`    ${file.type === 'd' ? '[DIR]' : '[FILE]'} ${file.name}`);
        }
      } catch (e) {
        console.log(`  Error listing: ${(e as Error).message}`);
      }
    }

  } catch (err) {
    console.error("SFTP error:", (err as Error).message);
  } finally {
    if (sftp) await closeSftpClient(sftp);
  }

  await pool.end();
  console.log("\n=== Done ===");
  process.exit(0);
}

main().catch(console.error);
