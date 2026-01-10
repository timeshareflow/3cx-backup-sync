/**
 * Schema Discovery Script
 *
 * Connects to the 3CX database and discovers the actual schema.
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { Client as SshClient } from "ssh2";
import { Pool } from "pg";
import * as net from "net";

dotenv.config();

interface TenantConfig {
  id: string;
  name: string;
  threecx_host: string;
  ssh_port: number;
  ssh_user: string;
  ssh_password: string;
  threecx_db_password: string;
}

async function createSshTunnel(tenant: TenantConfig): Promise<{ pool: Pool; close: () => void }> {
  return new Promise((resolve, reject) => {
    const sshClient = new SshClient();

    sshClient.on("ready", () => {
      console.log("SSH connection established");

      // Find a free local port
      const server = net.createServer();
      server.listen(0, "127.0.0.1", () => {
        const localPort = (server.address() as net.AddressInfo).port;
        server.close();

        // Forward local port to remote PostgreSQL
        sshClient.forwardOut(
          "127.0.0.1",
          localPort,
          "127.0.0.1",
          5432,
          (err, stream) => {
            if (err) {
              sshClient.end();
              reject(err);
              return;
            }

            // Create a TCP server to proxy connections
            const proxyServer = net.createServer((socket) => {
              sshClient.forwardOut(
                "127.0.0.1",
                localPort,
                "127.0.0.1",
                5432,
                (err, stream) => {
                  if (err) {
                    socket.end();
                    return;
                  }
                  socket.pipe(stream).pipe(socket);
                }
              );
            });

            proxyServer.listen(localPort, "127.0.0.1", () => {
              console.log(`SSH tunnel listening on port ${localPort}`);

              // Create PostgreSQL pool through the tunnel
              const pool = new Pool({
                host: "127.0.0.1",
                port: localPort,
                database: "database_single",
                user: "phonesystem",  // 3CX default user
                password: tenant.threecx_db_password,
                max: 1,
                connectionTimeoutMillis: 30000,
              });

              resolve({
                pool,
                close: () => {
                  pool.end();
                  proxyServer.close();
                  sshClient.end();
                }
              });
            });
          }
        );
      });
    });

    sshClient.on("error", reject);

    sshClient.connect({
      host: tenant.threecx_host,
      port: tenant.ssh_port || 22,
      username: tenant.ssh_user,
      password: tenant.ssh_password,
    });
  });
}

async function discoverSchema() {
  console.log("=== 3CX Schema Discovery ===\n");

  // Get tenant config from Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name, threecx_host, ssh_port, ssh_user, ssh_password, threecx_db_password")
    .eq("is_active", true)
    .eq("sync_enabled", true);

  if (!tenants || tenants.length === 0) {
    console.error("No active tenants found");
    process.exit(1);
  }

  const tenant = tenants[0] as TenantConfig;
  console.log(`Connecting to: ${tenant.name} (${tenant.threecx_host})\n`);

  const { pool, close } = await createSshTunnel(tenant);

  try {
    // Test connection
    const testResult = await pool.query("SELECT current_database(), current_user");
    console.log(`Connected to: ${testResult.rows[0].current_database} as ${testResult.rows[0].current_user}\n`);

    // Find all tables
    console.log("=== TABLES ===");
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log("All tables:", tables.rows.map(r => r.table_name).join(", "));

    // Find extension-related tables
    console.log("\n=== EXTENSION-RELATED TABLES ===");
    const extTables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name LIKE '%dn%' OR table_name LIKE '%ext%' OR table_name LIKE '%user%')
      ORDER BY table_name
    `);
    console.log("Extension-related tables:", extTables.rows.map(r => r.table_name).join(", "));

    // Check dn table structure if it exists
    console.log("\n=== DN TABLE STRUCTURE ===");
    try {
      const dnColumns = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'dn'
        ORDER BY ordinal_position
      `);
      if (dnColumns.rows.length > 0) {
        console.log("DN table columns:");
        dnColumns.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

        // Sample data
        const dnSample = await pool.query(`SELECT * FROM dn LIMIT 3`);
        console.log("\nDN sample data:", JSON.stringify(dnSample.rows, null, 2));
      } else {
        console.log("DN table not found");
      }
    } catch (err) {
      console.log("DN table not accessible:", (err as Error).message);
    }

    // Check for other extension-like tables
    console.log("\n=== SEARCHING FOR EXTENSION DATA ===");
    for (const table of extTables.rows) {
      try {
        const columns = await pool.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position
        `, [table.table_name]);

        const columnNames = columns.rows.map(c => c.column_name).join(", ");
        console.log(`\n${table.table_name}: ${columnNames}`);

        // Check if it has number/extension-like columns
        const hasExtColumn = columns.rows.some(c =>
          c.column_name.includes('number') ||
          c.column_name.includes('ext') ||
          c.column_name.includes('name')
        );

        if (hasExtColumn) {
          const sample = await pool.query(`SELECT * FROM ${table.table_name} LIMIT 2`);
          if (sample.rows.length > 0) {
            console.log(`  Sample: ${JSON.stringify(sample.rows[0])}`);
          }
        }
      } catch (err) {
        console.log(`  Error querying ${table.table_name}:`, (err as Error).message);
      }
    }

    // Check chat views
    console.log("\n=== CHAT VIEWS ===");
    const chatViews = await pool.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      AND table_name LIKE '%chat%'
      ORDER BY table_name
    `);
    console.log("Chat views:", chatViews.rows.map(r => r.table_name).join(", "));

    // Check chat_messages_view or chat_messages_history_view columns
    for (const viewName of ['chat_messages_view', 'chat_messages_history_view']) {
      try {
        const viewCols = await pool.query(`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position
        `, [viewName]);
        if (viewCols.rows.length > 0) {
          console.log(`\n${viewName} columns:`);
          viewCols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
        }
      } catch {
        // View doesn't exist
      }
    }

  } finally {
    close();
  }
}

discoverSchema().catch(console.error);
