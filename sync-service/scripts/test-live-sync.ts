import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { Client as SshClient } from "ssh2";
import { Pool } from "pg";
import * as net from "net";

dotenv.config();

async function test() {
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
  console.log("Testing live conversation sync with tenant:", tenant.name);

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
            // Test the new query that gets ALL conversations
            const result = await pool.query(`
              SELECT
                c.id::text as conversation_id,
                c.public_name as chat_name,
                c.is_external,
                c.participants_grp_array,
                c.provider_type,
                COUNT(m.id_message) as message_count
              FROM chat_conversation c
              LEFT JOIN chat_message m ON m.fkid_chat_conversation = c.id
              GROUP BY c.id, c.public_name, c.is_external, c.participants_grp_array, c.provider_type
              ORDER BY c.id
            `);

            console.log("\n=== ALL conversations from chat_conversation table ===");
            console.log("Total:", result.rows.length);

            // Show empty conversations
            const emptyConvs = result.rows.filter((r: { message_count: string }) => parseInt(r.message_count) === 0);
            console.log("\nEmpty conversations (0 messages):", emptyConvs.length);
            emptyConvs.forEach((c: { conversation_id: string; chat_name: string | null }) => {
              console.log("  Conv " + c.conversation_id + ": " + (c.chat_name || "(unnamed)"));
            });

            // Check what we have in Supabase
            const { data: supabaseConvos } = await supabase
              .from("conversations")
              .select("threecx_conversation_id, conversation_name")
              .eq("tenant_id", tenant.id);

            const syncedIds = new Set(supabaseConvos?.map((c: { threecx_conversation_id: string }) => c.threecx_conversation_id) || []);

            console.log("\n=== Currently missing from Supabase ===");
            let missing = 0;
            result.rows.forEach((c: { conversation_id: string; chat_name: string | null; message_count: string }) => {
              if (!syncedIds.has(c.conversation_id)) {
                missing++;
                console.log("  Conv " + c.conversation_id + ": " + (c.chat_name || "(unnamed)") + " - msgs: " + c.message_count);
              }
            });
            if (missing === 0) {
              console.log("  None - all conversations are synced!");
            } else {
              console.log("\nTotal missing:", missing);
            }

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

test().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
