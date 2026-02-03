/**
 * Explore voicemail directory structure via SFTP
 */

import "dotenv/config";
import { getActiveTenants, getTenantSftpConfig } from "../tenant";
import { createSftpClient, closeSftpClient } from "../storage/sftp";
import SftpClient from "ssh2-sftp-client";

async function listDir(sftp: SftpClient, path: string): Promise<void> {
  try {
    const files = await sftp.list(path);
    console.log(`\n${path}:`);
    files.forEach((f) => {
      const type = f.type === "d" ? "[DIR]" : "[FILE]";
      console.log(`  ${type} ${f.name}`);
    });
  } catch (e) {
    console.log(`\n${path}: NOT FOUND or ACCESS DENIED`);
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Explore Voicemail Directory Structure");
  console.log("=".repeat(60));

  const tenants = await getActiveTenants();
  const tenant = tenants[0];
  const sftpConfig = getTenantSftpConfig(tenant);

  if (!sftpConfig) {
    console.error("No SFTP config!");
    process.exit(1);
  }

  const sftp = await createSftpClient(sftpConfig);

  try {
    // Check possible voicemail directories
    const paths = [
      "/var/lib/3cxpbx/Instance1/Data/Voicemail",
      "/var/lib/3cxpbx/Instance1/Data/Ivr/Voicemail",
      "/var/lib/3cxpbx/Instance1/Data/Ivr",
      "/var/lib/3cxpbx/Instance1/Data",
      tenant.threecx_voicemail_path,
    ].filter(Boolean);

    for (const basePath of paths) {
      await listDir(sftp, basePath as string);

      // Try to list subdirectories
      try {
        const files = await sftp.list(basePath as string);
        for (const f of files.slice(0, 3)) {
          if (f.type === "d") {
            await listDir(sftp, `${basePath}/${f.name}`);
          }
        }
      } catch {
        // Ignore errors
      }
    }

    // Also check 302 specifically (the extension from our test)
    console.log("\n\n=== Checking extension 302 voicemail ===");
    const ext302Paths = [
      "/var/lib/3cxpbx/Instance1/Data/Voicemail/302",
      "/var/lib/3cxpbx/Instance1/Data/Ivr/Voicemail/302",
      "/var/lib/3cxpbx/Instance1/Data/Ivr/302",
    ];

    for (const p of ext302Paths) {
      await listDir(sftp, p);
    }

    // Search for the specific file
    console.log("\n\n=== Searching for vmail_129_302_20260128005230 ===");
    const searchPaths = [
      "/var/lib/3cxpbx/Instance1/Data",
      "/var/lib/3cxpbx/Instance1",
    ];

    for (const base of searchPaths) {
      try {
        const files = await sftp.list(base);
        for (const f of files) {
          if (f.type === "d") {
            try {
              const subFiles = await sftp.list(`${base}/${f.name}`);
              const match = subFiles.find((sf) => sf.name.includes("vmail"));
              if (match) {
                console.log(`Found vmail in: ${base}/${f.name}`);
                console.log(`  File: ${match.name}`);
              }
            } catch {
              // Ignore
            }
          }
        }
      } catch {
        // Ignore
      }
    }
  } catch (err) {
    console.error("Error:", (err as Error).message);
  }

  await closeSftpClient(sftp);
  process.exit(0);
}

main().catch(console.error);
