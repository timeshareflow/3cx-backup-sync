/**
 * Explore voicemail-related tables in 3CX database
 */

import "dotenv/config";
import { getActiveTenants, getTenantPool } from "../tenant";

async function main() {
  console.log("=".repeat(60));
  console.log("Explore Voicemail Tables in 3CX");
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

    // Find voicemail-related tables
    console.log("\n=== Voicemail-related Tables ===");
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name LIKE '%voicemail%' OR table_name LIKE '%vm%' OR table_name LIKE '%message%')
      ORDER BY table_name
    `);
    console.log("Found tables:", tablesResult.rows.map(r => r.table_name).join(", ") || "(none)");

    // Check specific likely table names
    const tablesToCheck = [
      "voicemails",
      "voicemail",
      "vm",
      "vms",
      "voicemail_messages",
      "vm_messages",
      "mailbox",
      "mailboxes",
    ];

    for (const tableName of tablesToCheck) {
      try {
        const existsResult = await client.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        `, [tableName]);

        if (existsResult.rows.length === 0) {
          continue;
        }

        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        const count = countResult.rows[0].count;

        console.log(`\n--- ${tableName}: ${count} rows ---`);

        if (count > 0) {
          // Get columns
          const columnsResult = await client.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position
            LIMIT 20
          `, [tableName]);
          console.log("Columns:", columnsResult.rows.map(r => r.column_name).join(", "));

          // Get sample row
          const sampleResult = await client.query(`SELECT * FROM ${tableName} LIMIT 2`);
          if (sampleResult.rows.length > 0) {
            console.log("\nSample row:");
            for (const [key, value] of Object.entries(sampleResult.rows[0])) {
              const displayValue = value === null ? "NULL" :
                typeof value === "object" ? JSON.stringify(value) :
                String(value).slice(0, 100);
              console.log(`  ${key}: ${displayValue}`);
            }
          }
        }
      } catch (e) {
        // Table doesn't exist
      }
    }

    // Also check for any paths that might contain voicemails
    console.log("\n\n=== Looking for voicemail file references ===");

    // Check recordings table for voicemail patterns
    try {
      const vmRecordings = await client.query(`
        SELECT recording_url
        FROM recordings
        WHERE recording_url ILIKE '%voicemail%' OR recording_url ILIKE '%vm%'
        LIMIT 5
      `);
      if (vmRecordings.rows.length > 0) {
        console.log("Voicemail recordings found:");
        vmRecordings.rows.forEach(r => console.log(`  ${r.recording_url}`));
      } else {
        console.log("No voicemail recordings in recordings table");
      }
    } catch (e) {
      console.log("Recordings table check failed:", (e as Error).message);
    }

    // List all tables to see what's available
    console.log("\n\n=== All Public Tables ===");
    const allTablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log(allTablesResult.rows.map(r => r.table_name).join("\n"));

    client.release();
  } catch (err) {
    console.error("Error:", (err as Error).message);
  }

  await pool.end();
  process.exit(0);
}

main().catch(console.error);
