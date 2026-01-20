/**
 * Compare live tables vs history views
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
            // Check counts
            console.log("\n=== MESSAGE COUNTS ===");

            const liveCount = await pool.query("SELECT COUNT(*) as count FROM chat_message");
            console.log("Live messages (chat_message table):", liveCount.rows[0].count);

            try {
              const historyCount = await pool.query("SELECT COUNT(*) as count FROM chat_messages_history_view");
              console.log("History messages (chat_messages_history_view):", historyCount.rows[0].count);
            } catch {
              console.log("chat_messages_history_view: not available");
            }

            // Check conversation counts
            console.log("\n=== CONVERSATION COUNTS ===");

            const liveConvCount = await pool.query("SELECT COUNT(*) as count FROM chat_conversation");
            console.log("Live conversations (chat_conversation table):", liveConvCount.rows[0].count);

            try {
              const historyConvCount = await pool.query("SELECT COUNT(DISTINCT conversation_id) as count FROM chat_history_view");
              console.log("History conversations (chat_history_view):", historyConvCount.rows[0].count);
            } catch {
              console.log("chat_history_view: not available");
            }

            // Sample live message structure
            console.log("\n=== LIVE MESSAGE SAMPLE (chat_message) ===");
            const liveSample = await pool.query(`
              SELECT * FROM chat_message
              ORDER BY time_sent DESC
              LIMIT 2
            `);
            console.log(JSON.stringify(liveSample.rows, null, 2));

            // Sample history message structure
            console.log("\n=== HISTORY MESSAGE SAMPLE (chat_messages_history_view) ===");
            try {
              const historySample = await pool.query(`
                SELECT * FROM chat_messages_history_view
                ORDER BY time_sent DESC
                LIMIT 2
              `);
              console.log(JSON.stringify(historySample.rows, null, 2));
            } catch (e) {
              console.log("Not available:", (e as Error).message);
            }

            // Check chat_conversation columns
            console.log("\n=== chat_conversation COLUMNS ===");
            const convCols = await pool.query(`
              SELECT column_name FROM information_schema.columns
              WHERE table_name = 'chat_conversation' ORDER BY ordinal_position
            `);
            console.log(convCols.rows.map((r) => r.column_name).join(", "));

            // Sample live conversation
            console.log("\n=== LIVE CONVERSATION SAMPLE (chat_conversation) ===");
            const convSample = await pool.query(`
              SELECT * FROM chat_conversation
              ORDER BY idconversation DESC
              LIMIT 2
            `);
            console.log(JSON.stringify(convSample.rows, null, 2));

            // Check chat_participant for linking
            console.log("\n=== chat_participant COLUMNS ===");
            const partCols = await pool.query(`
              SELECT column_name FROM information_schema.columns
              WHERE table_name = 'chat_participant' ORDER BY ordinal_position
            `);
            console.log(partCols.rows.map((r) => r.column_name).join(", "));

            // Sample participants
            console.log("\n=== PARTICIPANT SAMPLE ===");
            const partSample = await pool.query(`
              SELECT * FROM chat_participant LIMIT 3
            `);
            console.log(JSON.stringify(partSample.rows, null, 2));

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
