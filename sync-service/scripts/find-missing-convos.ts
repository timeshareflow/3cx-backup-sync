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
  console.log("Checking:", tenant.name);

  return new Promise((resolve) => {
    const ssh = new SshClient();

    ssh.on("ready", () => {
      const server = net.createServer();
      server.listen(0, "127.0.0.1", () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close();

        const proxy = net.createServer((socket) => {
          ssh.forwardOut("127.0.0.1", port, "127.0.0.1", 5432, (err, stream) => {
            if (err) { socket.end(); return; }
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
          });

          try {
            // Get ALL live conversations with message counts
            const liveConvos = await pool.query(`
              SELECT c.id as conv_id, c.party, c.is_external, c.public_name,
                     COUNT(m.id_message) as msg_count,
                     MAX(m.time_sent) as last_message
              FROM chat_conversation c
              LEFT JOIN chat_message m ON m.fkid_chat_conversation = c.id
              GROUP BY c.id, c.party, c.is_external, c.public_name
              ORDER BY c.id
            `);

            console.log("\n=== ALL LIVE CONVERSATIONS ===");
            console.log("Total:", liveConvos.rows.length);
            for (const conv of liveConvos.rows) {
              const party = conv.party || "none";
              const name = conv.public_name || "none";
              console.log("  Conv " + conv.conv_id + ": " + conv.msg_count + " msgs, last: " + conv.last_message + ", party: " + party + ", name: " + name);
            }

            // Get conversations from history view
            const historyConvos = await pool.query(`
              SELECT DISTINCT conversation_id
              FROM chat_messages_history_view
              ORDER BY conversation_id
            `);

            const historyIds = new Set(historyConvos.rows.map((r: { conversation_id: number }) => r.conversation_id));

            console.log("\n=== CONVERSATIONS IN LIVE BUT NOT IN HISTORY ===");
            let missingFromHistory = 0;
            for (const conv of liveConvos.rows) {
              if (!historyIds.has(conv.conv_id)) {
                missingFromHistory++;
                const party = conv.party || "none";
                const name = conv.public_name || "none";
                console.log("  Conv " + conv.conv_id + ": " + conv.msg_count + " msgs, party: " + party + ", name: " + name);
              }
            }
            if (missingFromHistory === 0) console.log("  None");

            // Check what we have in Supabase
            const { data: supabaseConvos } = await supabase
              .from("conversations")
              .select("id, threecx_conversation_id")
              .eq("tenant_id", tenant.id);

            const syncedIds = new Set(supabaseConvos?.map((c: { threecx_conversation_id: string }) => parseInt(c.threecx_conversation_id)) || []);

            console.log("\n=== CONVERSATIONS NOT SYNCED TO SUPABASE ===");
            let notSynced = 0;
            for (const conv of liveConvos.rows) {
              if (!syncedIds.has(conv.conv_id)) {
                notSynced++;
                const party = conv.party || "none";
                const name = conv.public_name || "none";
                console.log("  Conv " + conv.conv_id + ": " + conv.msg_count + " msgs, party: " + party + ", name: " + name);
              }
            }
            if (notSynced === 0) console.log("  None");

            console.log("\n=== SUMMARY ===");
            console.log("Live conversations: " + liveConvos.rows.length);
            console.log("In history view: " + historyConvos.rows.length);
            console.log("Synced to Supabase: " + syncedIds.size);
            console.log("Missing from history: " + missingFromHistory);
            console.log("Not synced to Supabase: " + notSynced);

          } finally {
            await pool.end();
            proxy.close();
            ssh.end();
            resolve(null);
          }
        });
      });
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
