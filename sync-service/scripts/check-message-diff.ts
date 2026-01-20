/**
 * Find messages in live table NOT in history view
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
  console.log("Connecting to:", tenant.name);

  return new Promise((resolve) => {
    const ssh = new SshClient();

    ssh.on("ready", () => {
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
            // Messages in live table but NOT in history
            console.log("=== MESSAGES IN LIVE BUT NOT IN HISTORY ===");
            const liveNotHistory = await pool.query(`
              SELECT m.id_message, m.fkid_chat_conversation, m.message, m.time_sent, m.party
              FROM chat_message m
              WHERE m.id_message NOT IN (
                SELECT message_id FROM chat_messages_history_view
              )
              ORDER BY m.time_sent DESC
            `);
            console.log("Count:", liveNotHistory.rows.length);
            console.log(JSON.stringify(liveNotHistory.rows.slice(0, 5), null, 2));

            // Messages in history but NOT in live table
            console.log("\n=== MESSAGES IN HISTORY BUT NOT IN LIVE ===");
            const historyNotLive = await pool.query(`
              SELECT h.message_id, h.conversation_id, h.message, h.time_sent, h.sender_participant_name
              FROM chat_messages_history_view h
              WHERE h.message_id NOT IN (
                SELECT id_message FROM chat_message
              )
              ORDER BY h.time_sent DESC
            `);
            console.log("Count:", historyNotLive.rows.length);
            console.log(JSON.stringify(historyNotLive.rows.slice(0, 5), null, 2));

            // Check what the history view definition looks like
            console.log("\n=== HISTORY VIEW DEFINITION ===");
            const viewDef = await pool.query(`
              SELECT pg_get_viewdef('chat_messages_history_view'::regclass, true)
            `);
            console.log(viewDef.rows[0].pg_get_viewdef);

            // Check the most recent messages in our Supabase that were synced
            console.log("\n=== DATE RANGE OF MESSAGES ===");
            const dateRange = await pool.query(`
              SELECT
                MIN(time_sent) as earliest_live,
                MAX(time_sent) as latest_live
              FROM chat_message
            `);
            console.log("Live table range:", dateRange.rows[0]);

            const historyRange = await pool.query(`
              SELECT
                MIN(time_sent) as earliest_history,
                MAX(time_sent) as latest_history
              FROM chat_messages_history_view
            `);
            console.log("History view range:", historyRange.rows[0]);

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
