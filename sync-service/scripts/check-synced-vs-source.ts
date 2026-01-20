/**
 * Compare what's synced in Supabase vs what's in 3CX
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

  // Get tenant
  const { data: tenants } = await supabase
    .from("tenants")
    .select("*")
    .eq("is_active", true)
    .limit(1);

  const tenant = tenants![0];
  console.log("Tenant:", tenant.name, "ID:", tenant.id);

  // Check Supabase counts
  console.log("\n=== SUPABASE DATA ===");

  const { count: supaMsgCount } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenant.id);
  console.log("Messages in Supabase:", supaMsgCount);

  const { count: supaConvCount } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenant.id);
  console.log("Conversations in Supabase:", supaConvCount);

  // Get latest synced messages
  const { data: latestMsgs } = await supabase
    .from("messages")
    .select("threecx_message_id, sent_at, content")
    .eq("tenant_id", tenant.id)
    .order("sent_at", { ascending: false })
    .limit(5);
  console.log("\nLatest synced messages:");
  latestMsgs?.forEach(m => console.log(`  ID: ${m.threecx_message_id}, sent: ${m.sent_at}, content: ${(m.content || "").substring(0, 50)}`));

  // Check sync status
  const { data: syncStatus } = await supabase
    .from("sync_status")
    .select("*")
    .eq("tenant_id", tenant.id);
  console.log("\nSync status:");
  syncStatus?.forEach(s => console.log(`  ${s.sync_type}: last_synced_timestamp=${s.last_synced_timestamp}, status=${s.status}`));

  // Now check 3CX
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
            console.log("\n=== 3CX DATA ===");

            const msgCount = await pool.query("SELECT COUNT(*) as count FROM chat_messages_history_view");
            console.log("Messages in 3CX:", msgCount.rows[0].count);

            const convCount = await pool.query("SELECT COUNT(DISTINCT conversation_id) as count FROM chat_history_view");
            console.log("Conversations in 3CX (history view):", convCount.rows[0].count);

            const liveConvCount = await pool.query("SELECT COUNT(*) as count FROM chat_conversation");
            console.log("Conversations in 3CX (live table):", liveConvCount.rows[0].count);

            // Latest messages from 3CX
            const latest3cx = await pool.query(`
              SELECT message_id, time_sent, message, sender_participant_name
              FROM chat_messages_history_view
              ORDER BY time_sent DESC
              LIMIT 5
            `);
            console.log("\nLatest 3CX messages:");
            latest3cx.rows.forEach((m: { message_id: number; time_sent: Date; message: string; sender_participant_name: string }) =>
              console.log(`  ID: ${m.message_id}, sent: ${m.time_sent}, from: ${m.sender_participant_name}, msg: ${(m.message || "").substring(0, 50)}`)
            );

            // Check if any 3CX message_ids are missing from Supabase
            const allThreecxIds = await pool.query("SELECT message_id FROM chat_messages_history_view ORDER BY message_id");
            const threecxIds = allThreecxIds.rows.map((r: { message_id: number }) => String(r.message_id));

            const { data: syncedMsgs } = await supabase
              .from("messages")
              .select("threecx_message_id")
              .eq("tenant_id", tenant.id);
            const syncedIds = new Set(syncedMsgs?.map(m => m.threecx_message_id) || []);

            const missing = threecxIds.filter((id: string) => !syncedIds.has(id));
            console.log(`\nMessages in 3CX not in Supabase: ${missing.length}`);
            if (missing.length > 0) {
              console.log("First 10 missing:", missing.slice(0, 10));

              // Get details of missing
              const missingDetails = await pool.query(`
                SELECT message_id, conversation_id, time_sent, message, sender_participant_name
                FROM chat_messages_history_view
                WHERE message_id = ANY($1)
                ORDER BY time_sent DESC
                LIMIT 10
              `, [missing.slice(0, 10).map(Number)]);
              console.log("\nMissing message details:");
              console.log(JSON.stringify(missingDetails.rows, null, 2));
            }

            // Check conversations
            const allThreecxConvs = await pool.query("SELECT DISTINCT conversation_id FROM chat_history_view");
            const threecxConvs = allThreecxConvs.rows.map((r: { conversation_id: number }) => String(r.conversation_id));

            const { data: syncedConvs } = await supabase
              .from("conversations")
              .select("threecx_conversation_id")
              .eq("tenant_id", tenant.id);
            const syncedConvIds = new Set(syncedConvs?.map(c => c.threecx_conversation_id) || []);

            const missingConvs = threecxConvs.filter((id: string) => !syncedConvIds.has(id));
            console.log(`\nConversations in 3CX not in Supabase: ${missingConvs.length}`);
            if (missingConvs.length > 0) {
              console.log("Missing conversation IDs:", missingConvs);
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
