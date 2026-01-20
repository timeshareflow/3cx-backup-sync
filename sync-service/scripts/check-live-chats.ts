/**
 * Check 3CX live chat tables vs history views
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { Client as SshClient } from "ssh2";
import { Pool } from "pg";
import * as net from "net";

dotenv.config();

async function check() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: tenants } = await supabase
    .from("tenants")
    .select("*")
    .eq("is_active", true)
    .limit(1);

  const tenant = tenants![0];
  console.log("Connecting to:", tenant.name, tenant.threecx_host);

  return new Promise((resolve) => {
    const ssh = new SshClient();

    ssh.on("ready", () => {
      console.log("SSH connected");

      const server = net.createServer();
      server.listen(0, "127.0.0.1", () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close();

        const proxy = net.createServer((socket) => {
          ssh.forwardOut("127.0.0.1", port, "127.0.0.1", 5432, (err, stream) => {
            if (err) {
              socket.end();
              return;
            }
            socket.pipe(stream).pipe(socket);
          });
        });

        proxy.listen(port, "127.0.0.1", async () => {
          console.log("Tunnel on port", port);

          const pool = new Pool({
            host: "127.0.0.1",
            port,
            database: "database_single",
            user: "phonesystem",
            password: tenant.threecx_db_password,
            max: 1,
            connectionTimeoutMillis: 30000,
          });

          try {
            // Check what chat tables exist
            const tables = await pool.query(`
              SELECT table_name FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name LIKE 'chat%'
              ORDER BY table_name
            `);
            console.log("\n=== CHAT TABLES ===");
            console.log(tables.rows.map((r) => r.table_name).join(", "));

            // Check chat_message table columns
            const cols = await pool.query(`
              SELECT column_name FROM information_schema.columns
              WHERE table_name = 'chat_message' ORDER BY ordinal_position
            `);
            console.log("\n=== chat_message columns ===");
            console.log(cols.rows.map((r) => r.column_name).join(", "));

            // Sample from chat_message table (live messages)
            const sample = await pool.query("SELECT * FROM chat_message ORDER BY fkidconversation DESC LIMIT 3");
            console.log("\n=== Sample chat_message (live) ===");
            console.log(JSON.stringify(sample.rows, null, 2));

            // Count live vs history messages
            const liveCount = await pool.query("SELECT COUNT(*) as count FROM chat_message");
            console.log("\n=== COUNTS ===");
            console.log("Live messages (chat_message):", liveCount.rows[0].count);

            try {
              const historyCount = await pool.query("SELECT COUNT(*) as count FROM chat_messages_history_view");
              console.log("History messages (chat_messages_history_view):", historyCount.rows[0].count);
            } catch {
              console.log("chat_messages_history_view: not available");
            }

            // Check chat_conversation table
            const convCols = await pool.query(`
              SELECT column_name FROM information_schema.columns
              WHERE table_name = 'chat_conversation' ORDER BY ordinal_position
            `);
            console.log("\n=== chat_conversation columns ===");
            console.log(convCols.rows.map((r) => r.column_name).join(", "));

            // Sample conversations
            const convSample = await pool.query("SELECT * FROM chat_conversation ORDER BY idconversation DESC LIMIT 3");
            console.log("\n=== Sample chat_conversation (live) ===");
            console.log(JSON.stringify(convSample.rows, null, 2));

            // Count live conversations
            const liveConvCount = await pool.query("SELECT COUNT(*) as count FROM chat_conversation");
            console.log("\nLive conversations (chat_conversation):", liveConvCount.rows[0].count);

          } finally {
            await pool.end();
            proxy.close();
            ssh.end();
            resolve(null);
          }
        });
      });
    });

    ssh.on("error", (err) => {
      console.error("SSH error:", err);
      resolve(null);
    });

    ssh.connect({
      host: tenant.threecx_host,
      port: tenant.ssh_port || 22,
      username: tenant.ssh_user,
      password: tenant.ssh_password,
    });
  });
}

check().then(() => process.exit(0));
