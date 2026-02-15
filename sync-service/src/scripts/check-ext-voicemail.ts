/**
 * Check specific extension voicemail directory
 */

import "dotenv/config";
import { getActiveTenants, getTenantSftpConfig } from "../tenant";
import { createSftpClient, closeSftpClient } from "../storage/sftp";

async function main() {
  const tenants = await getActiveTenants();
  const tenant = tenants[0];
  const sftpConfig = getTenantSftpConfig(tenant);

  if (!sftpConfig) {
    console.error("No SFTP config!");
    process.exit(1);
  }

  const sftp = await createSftpClient(sftpConfig);

  try {
    // Check the Data/302 folder
    const path302 = "/var/lib/3cxpbx/Instance1/Data/Ivr/Voicemail/Data/302";
    console.log("Checking:", path302);

    const files = await sftp.list(path302);
    console.log(`\nFound ${files.length} files:`);
    files.forEach((f) => {
      console.log(`  ${f.type === "d" ? "[DIR]" : "[FILE]"} ${f.name} (${f.size} bytes)`);
    });

    // Also check Extensions/302
    const ext302 = "/var/lib/3cxpbx/Instance1/Data/Ivr/Voicemail/Extensions/302";
    console.log("\n\nChecking:", ext302);

    try {
      const extFiles = await sftp.list(ext302);
      console.log(`Found ${extFiles.length} files:`);
      extFiles.forEach((f) => {
        console.log(`  ${f.type === "d" ? "[DIR]" : "[FILE]"} ${f.name} (${f.size} bytes)`);
      });
    } catch (e) {
      console.log("Not accessible:", (e as Error).message);
    }
  } catch (err) {
    console.error("Error:", (err as Error).message);
  }

  await closeSftpClient(sftp);
  process.exit(0);
}

main().catch(console.error);
