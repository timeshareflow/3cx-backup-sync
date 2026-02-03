/**
 * Check s_voicemail table for actual voicemail messages
 */

import "dotenv/config";
import { getActiveTenants, getTenantPool } from "../tenant";

async function main() {
  console.log("=".repeat(60));
  console.log("Check Voicemail Messages in 3CX");
  console.log("=".repeat(60));

  const tenants = await getActiveTenants();
  const tenant = tenants[0];
  const pool = await getTenantPool(tenant);

  if (!pool) {
    console.error("Failed to get pool!");
    process.exit(1);
  }

  try {
    const client = await pool.connect();

    // Check s_voicemail table
    console.log("\n=== s_voicemail table ===");
    try {
      const columnsResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 's_voicemail'
        ORDER BY ordinal_position
      `);
      console.log("Columns:");
      columnsResult.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

      const countResult = await client.query(`SELECT COUNT(*) as count FROM s_voicemail`);
      console.log(`\nRow count: ${countResult.rows[0].count}`);

      if (parseInt(countResult.rows[0].count) > 0) {
        const sampleResult = await client.query(`SELECT * FROM s_voicemail LIMIT 3`);
        console.log("\nSample rows:");
        sampleResult.rows.forEach((row, i) => {
          console.log(`\n--- Row ${i + 1} ---`);
          for (const [key, value] of Object.entries(row)) {
            const displayValue = value === null ? "NULL" :
              typeof value === "object" ? JSON.stringify(value) :
              String(value).slice(0, 100);
            console.log(`  ${key}: ${displayValue}`);
          }
        });
      }
    } catch (e) {
      console.log("Error:", (e as Error).message);
    }

    // Check prstorage table - might store file references
    console.log("\n\n=== prstorage table (file storage) ===");
    try {
      const columnsResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'prstorage'
        ORDER BY ordinal_position
      `);
      console.log("Columns:");
      columnsResult.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

      const countResult = await client.query(`SELECT COUNT(*) as count FROM prstorage`);
      console.log(`\nRow count: ${countResult.rows[0].count}`);

      // Check for voicemail files
      const vmFiles = await client.query(`
        SELECT * FROM prstorage
        WHERE filename ILIKE '%voicemail%' OR filename ILIKE '%vm%' OR storagepath ILIKE '%voicemail%'
        LIMIT 5
      `);
      if (vmFiles.rows.length > 0) {
        console.log("\nVoicemail files:");
        vmFiles.rows.forEach((row, i) => {
          console.log(`\n--- File ${i + 1} ---`);
          for (const [key, value] of Object.entries(row)) {
            const displayValue = value === null ? "NULL" :
              typeof value === "object" ? JSON.stringify(value) :
              String(value).slice(0, 100);
            console.log(`  ${key}: ${displayValue}`);
          }
        });
      } else {
        // Show any files
        const anyFiles = await client.query(`SELECT * FROM prstorage LIMIT 3`);
        console.log("\nSample files:");
        anyFiles.rows.forEach((row, i) => {
          console.log(`\n--- File ${i + 1} ---`);
          for (const [key, value] of Object.entries(row)) {
            const displayValue = value === null ? "NULL" :
              typeof value === "object" ? JSON.stringify(value) :
              String(value).slice(0, 100);
            console.log(`  ${key}: ${displayValue}`);
          }
        });
      }
    } catch (e) {
      console.log("Error:", (e as Error).message);
    }

    client.release();
  } catch (err) {
    console.error("Error:", (err as Error).message);
  }

  await pool.end();
  process.exit(0);
}

main().catch(console.error);
