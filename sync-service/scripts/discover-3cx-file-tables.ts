/**
 * Discover 3CX File-related Tables
 *
 * Looking for tables that map filenames/messages to file hashes
 */

import dotenv from "dotenv";
import { Pool } from "pg";
import * as net from "net";
import { Client as SshClient } from "ssh2";

dotenv.config();

async function createSshTunnel(config: {
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshPassword: string;
  dbHost: string;
  dbPort: number;
  localPort: number;
}): Promise<{ server: net.Server; close: () => void }> {
  return new Promise((resolve, reject) => {
    const sshClient = new SshClient();

    sshClient.on("ready", () => {
      const server = net.createServer((sock) => {
        sshClient.forwardOut(
          sock.remoteAddress || "127.0.0.1",
          sock.remotePort || 0,
          config.dbHost,
          config.dbPort,
          (err, stream) => {
            if (err) {
              sock.end();
              return;
            }
            sock.pipe(stream).pipe(sock);
          }
        );
      });

      server.listen(config.localPort, "127.0.0.1", () => {
        resolve({
          server,
          close: () => {
            server.close();
            sshClient.end();
          },
        });
      });
    });

    sshClient.on("error", reject);

    sshClient.connect({
      host: config.sshHost,
      port: config.sshPort,
      username: config.sshUser,
      password: config.sshPassword,
    });
  });
}

async function main() {
  // Get tenant config from Supabase
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("is_active", true)
    .single();

  if (!tenant) {
    console.log("No active tenant found");
    return;
  }

  console.log(`Connecting to 3CX server for tenant: ${tenant.name}`);
  console.log(`Host: ${tenant.threecx_host}`);

  // Create SSH tunnel
  const localPort = 15432;
  const tunnel = await createSshTunnel({
    sshHost: tenant.threecx_host,
    sshPort: tenant.ssh_port || 22,
    sshUser: tenant.ssh_user,
    sshPassword: tenant.ssh_password,
    dbHost: "localhost",
    dbPort: 5432,
    localPort,
  });

  console.log(`SSH tunnel established on port ${localPort}`);

  try {
    // Connect to 3CX database
    const pool = new Pool({
      host: "127.0.0.1",
      port: localPort,
      user: "phonesystem",
      password: tenant.threecx_db_password || tenant.threecx_password,
      database: "database_single",
    });

    const client = await pool.connect();

    // Find all tables that might relate to files/attachments
    console.log("\n=== Tables related to files/attachments ===");
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name LIKE '%file%'
           OR table_name LIKE '%attach%'
           OR table_name LIKE '%media%'
           OR table_name LIKE '%blob%'
           OR table_name LIKE '%storage%')
      ORDER BY table_name
    `);
    console.log("Found tables:", tablesResult.rows.map(r => r.table_name));

    // Check for chat-related tables that might have file info
    console.log("\n=== Chat tables ===");
    const chatTablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE '%chat%'
      ORDER BY table_name
    `);
    console.log("Found chat tables:", chatTablesResult.rows.map(r => r.table_name));

    // Check the structure of interesting tables
    for (const tableName of ["chat_files", "chatmessagefiles", "messageattachments", "chat_attachments"]) {
      try {
        const columnsResult = await client.query(`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position
        `, [tableName]);

        if (columnsResult.rows.length > 0) {
          console.log(`\n=== Table: ${tableName} ===`);
          columnsResult.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

          // Sample data
          const dataResult = await client.query(`SELECT * FROM ${tableName} LIMIT 3`);
          console.log("Sample data:", JSON.stringify(dataResult.rows, null, 2));
        }
      } catch {
        // Table doesn't exist
      }
    }

    // Look for any table with columns that might store file info
    console.log("\n=== Tables with 'file' columns ===");
    const fileColumnsResult = await client.query(`
      SELECT DISTINCT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND (column_name LIKE '%file%' OR column_name LIKE '%hash%' OR column_name LIKE '%path%')
      AND table_name LIKE '%chat%'
      ORDER BY table_name, column_name
    `);
    fileColumnsResult.rows.forEach(r => console.log(`  ${r.table_name}.${r.column_name}`));

    // Check chat_history table structure specifically
    console.log("\n=== chat_history table columns ===");
    const chatHistoryResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'chat_history'
      ORDER BY ordinal_position
    `);
    chatHistoryResult.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

    // Look at a sample message with file content
    console.log("\n=== Sample messages with file-like content ===");
    const msgResult = await client.query(`
      SELECT message_id, message, time_sent
      FROM chat_messages_history_view
      WHERE message LIKE '%.jpg' OR message LIKE '%.png' OR message LIKE '%.MOV' OR message LIKE '%.mp4'
      ORDER BY time_sent DESC
      LIMIT 5
    `);
    msgResult.rows.forEach(m => console.log(`  ${m.time_sent} | ${m.message_id} | ${m.message}`));

    client.release();
    await pool.end();
  } finally {
    tunnel.close();
  }
}

main().catch(console.error);
