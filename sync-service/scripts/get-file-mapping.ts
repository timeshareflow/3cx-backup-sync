/**
 * Get 3CX File Mapping
 *
 * Query chat_message table for internal_file_name (hash) and public_file_name (original)
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

  try {
    const pool = new Pool({
      host: "127.0.0.1",
      port: localPort,
      user: "phonesystem",
      password: tenant.threecx_db_password || tenant.threecx_password,
      database: "database_single",
    });

    const client = await pool.connect();

    // Get chat_message columns
    console.log("=== chat_message table structure ===");
    const colsResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'chat_message'
      ORDER BY ordinal_position
    `);
    colsResult.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

    // Get messages with files
    console.log("\n=== Messages with file info ===");
    const filesResult = await client.query(`
      SELECT
        id_message,
        message,
        internal_file_name,
        public_file_name,
        file_info,
        file_archived
      FROM chat_message
      WHERE internal_file_name IS NOT NULL
         OR public_file_name IS NOT NULL
      ORDER BY id_message DESC
      LIMIT 20
    `);

    filesResult.rows.forEach(row => {
      console.log(`\nMessage ID: ${row.id_message}`);
      console.log(`  message: ${row.message}`);
      console.log(`  internal_file_name (hash): ${row.internal_file_name}`);
      console.log(`  public_file_name (original): ${row.public_file_name}`);
      console.log(`  file_info: ${row.file_info}`);
      console.log(`  file_archived: ${row.file_archived}`);
    });

    // Also check chat_history_mess for archived messages
    console.log("\n=== chat_history_mess columns ===");
    const histColsResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'chat_history_mess'
      ORDER BY ordinal_position
    `);
    histColsResult.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

    // Get archived messages with files
    console.log("\n=== Archived messages with file info ===");
    try {
      const histFilesResult = await client.query(`
        SELECT
          idmessage,
          message,
          internal_file_name,
          public_file_name
        FROM chat_history_mess
        WHERE internal_file_name IS NOT NULL
           OR public_file_name IS NOT NULL
        ORDER BY idmessage DESC
        LIMIT 20
      `);

      histFilesResult.rows.forEach(row => {
        console.log(`  ${row.idmessage} | internal: ${row.internal_file_name} | public: ${row.public_file_name} | msg: ${row.message}`);
      });
    } catch (err) {
      console.log("chat_history_mess query failed:", (err as Error).message);
    }

    client.release();
    await pool.end();
  } finally {
    tunnel.close();
  }
}

main().catch(console.error);
