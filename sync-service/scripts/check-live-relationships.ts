/**
 * Understand relationships between live tables
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
            // Check which conversations exist only in live table but NOT in history
            console.log("=== LIVE-ONLY CONVERSATIONS (not in history) ===");
            const liveOnly = await pool.query(`
              SELECT DISTINCT c.id, c.is_external, c.queue_no, c.public_name
              FROM chat_conversation c
              WHERE c.id NOT IN (
                SELECT DISTINCT conversation_id FROM chat_history_view
              )
            `);
            console.log("Count:", liveOnly.rows.length);
            console.log(JSON.stringify(liveOnly.rows, null, 2));

            // Get messages from these live-only conversations
            console.log("\n=== MESSAGES IN LIVE-ONLY CONVERSATIONS ===");
            const liveOnlyIds = liveOnly.rows.map(r => r.id);
            if (liveOnlyIds.length > 0) {
              const messagesInLive = await pool.query(`
                SELECT m.id_message, m.message, m.time_sent, m.fkid_chat_conversation, m.party
                FROM chat_message m
                WHERE m.fkid_chat_conversation = ANY($1)
                ORDER BY m.time_sent DESC
                LIMIT 10
              `, [liveOnlyIds]);
              console.log(JSON.stringify(messagesInLive.rows, null, 2));
            }

            // Check chat_participant structure - key to sender info
            console.log("\n=== chat_participant COLUMNS ===");
            const partCols = await pool.query(`
              SELECT column_name, data_type FROM information_schema.columns
              WHERE table_name = 'chat_participant' ORDER BY ordinal_position
            `);
            partCols.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

            // Sample participant data
            console.log("\n=== PARTICIPANT SAMPLE FOR RECENT CONVERSATION ===");
            const partSample = await pool.query(`
              SELECT * FROM chat_participant
              WHERE fkid_chat_conversation = 40
            `);
            console.log(JSON.stringify(partSample.rows, null, 2));

            // Check chat_conversation_member structure
            console.log("\n=== chat_conversation_member COLUMNS ===");
            const memCols = await pool.query(`
              SELECT column_name, data_type FROM information_schema.columns
              WHERE table_name = 'chat_conversation_member' ORDER BY ordinal_position
            `);
            memCols.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

            // Sample member data
            console.log("\n=== CONVERSATION MEMBER SAMPLE ===");
            const memSample = await pool.query(`
              SELECT * FROM chat_conversation_member
              WHERE fkidconversation = 40
            `);
            console.log(JSON.stringify(memSample.rows, null, 2));

            // Try to build a live messages query with sender info
            console.log("\n=== ATTEMPTING LIVE MESSAGES QUERY ===");
            const liveQuery = await pool.query(`
              SELECT
                m.id_message as message_id,
                m.fkid_chat_conversation as conversation_id,
                c.is_external,
                c.queue_no as queue_number,
                m.party as sender_party,
                m.message,
                m.time_sent
              FROM chat_message m
              JOIN chat_conversation c ON c.id = m.fkid_chat_conversation
              ORDER BY m.time_sent DESC
              LIMIT 5
            `);
            console.log(JSON.stringify(liveQuery.rows, null, 2));

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
