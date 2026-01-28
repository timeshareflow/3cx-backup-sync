import { Client } from "pg";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL in .env.local");
  process.exit(1);
}

async function migrate() {
  const client = new Client({ connectionString: databaseUrl });

  try {
    console.log("Connecting to database...");
    await client.connect();
    console.log("Connected!\n");

    console.log("Running migrations...\n");

    const migrations = [
      // sync_logs columns
      {
        name: "Add message column to sync_logs",
        sql: `ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS message text;`,
      },
      {
        name: "Add details column to sync_logs",
        sql: `ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS details jsonb;`,
      },
      {
        name: "Add duration_ms column to sync_logs",
        sql: `ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS duration_ms integer;`,
      },
      // sync_status columns
      {
        name: "Add last_error column to sync_status",
        sql: `ALTER TABLE sync_status ADD COLUMN IF NOT EXISTS last_error text;`,
      },
      {
        name: "Add last_success_at column to sync_status",
        sql: `ALTER TABLE sync_status ADD COLUMN IF NOT EXISTS last_success_at timestamptz;`,
      },
      {
        name: "Add last_error_at column to sync_status",
        sql: `ALTER TABLE sync_status ADD COLUMN IF NOT EXISTS last_error_at timestamptz;`,
      },
      {
        name: "Add items_synced column to sync_status",
        sql: `ALTER TABLE sync_status ADD COLUMN IF NOT EXISTS items_synced integer DEFAULT 0;`,
      },
      {
        name: "Add items_failed column to sync_status",
        sql: `ALTER TABLE sync_status ADD COLUMN IF NOT EXISTS items_failed integer DEFAULT 0;`,
      },
      {
        name: "Add updated_at column to sync_status",
        sql: `ALTER TABLE sync_status ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();`,
      },
      // conversations columns
      {
        name: "Add threecx_conversation_id column to conversations",
        sql: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS threecx_conversation_id varchar(255);`,
      },
      {
        name: "Add conversation_name column to conversations",
        sql: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS conversation_name varchar(255);`,
      },
      {
        name: "Add is_external column to conversations",
        sql: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_external boolean DEFAULT false;`,
      },
      {
        name: "Add is_group_chat column to conversations",
        sql: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_group_chat boolean DEFAULT false;`,
      },
      {
        name: "Add participant_count column to conversations",
        sql: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS participant_count integer DEFAULT 2;`,
      },
      {
        name: "Add first_message_at column to conversations",
        sql: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_message_at timestamptz;`,
      },
      {
        name: "Add last_message_at column to conversations",
        sql: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_at timestamptz;`,
      },
      {
        name: "Add message_count column to conversations",
        sql: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS message_count integer DEFAULT 0;`,
      },
      // messages columns
      {
        name: "Add threecx_message_id column to messages",
        sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS threecx_message_id varchar(255);`,
      },
      {
        name: "Add sender_identifier column to messages",
        sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_identifier varchar(255);`,
      },
      {
        name: "Add sender_name column to messages",
        sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name varchar(255);`,
      },
      {
        name: "Add message_type column to messages",
        sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type varchar(50) DEFAULT 'text';`,
      },
      {
        name: "Add content column to messages",
        sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS content text;`,
      },
      {
        name: "Add has_media column to messages",
        sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS has_media boolean DEFAULT false;`,
      },
      {
        name: "Add media_count column to messages",
        sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_count integer DEFAULT 0;`,
      },
      {
        name: "Add is_deleted column to messages",
        sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;`,
      },
      {
        name: "Add sent_at column to messages",
        sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_at timestamptz;`,
      },
      {
        name: "Add delivered_at column to messages",
        sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz;`,
      },
      {
        name: "Add read_at column to messages",
        sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at timestamptz;`,
      },
      // extensions columns
      {
        name: "Add extension_number column to extensions",
        sql: `ALTER TABLE extensions ADD COLUMN IF NOT EXISTS extension_number varchar(50);`,
      },
      {
        name: "Add first_name column to extensions",
        sql: `ALTER TABLE extensions ADD COLUMN IF NOT EXISTS first_name varchar(255);`,
      },
      {
        name: "Add last_name column to extensions",
        sql: `ALTER TABLE extensions ADD COLUMN IF NOT EXISTS last_name varchar(255);`,
      },
      {
        name: "Add display_name column to extensions",
        sql: `ALTER TABLE extensions ADD COLUMN IF NOT EXISTS display_name varchar(255);`,
      },
      {
        name: "Add email column to extensions",
        sql: `ALTER TABLE extensions ADD COLUMN IF NOT EXISTS email varchar(255);`,
      },
      {
        name: "Add is_active column to extensions",
        sql: `ALTER TABLE extensions ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;`,
      },
      {
        name: "Add last_synced_at column to extensions",
        sql: `ALTER TABLE extensions ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;`,
      },
      // Create unique indexes if missing
      {
        name: "Create unique index on conversations",
        sql: `CREATE UNIQUE INDEX IF NOT EXISTS conversations_tenant_id_threecx_conversation_id_key ON conversations(tenant_id, threecx_conversation_id);`,
      },
      {
        name: "Create unique index on messages",
        sql: `CREATE UNIQUE INDEX IF NOT EXISTS messages_tenant_id_threecx_message_id_key ON messages(tenant_id, threecx_message_id);`,
      },
      {
        name: "Create unique index on extensions",
        sql: `CREATE UNIQUE INDEX IF NOT EXISTS extensions_tenant_id_extension_number_key ON extensions(tenant_id, extension_number);`,
      },
      // Grant permissions to all roles (fixes RLS bypass issues with admin client)
      {
        name: "Grant permissions on storage_plans",
        sql: `GRANT ALL ON storage_plans TO anon, authenticated, service_role;`,
      },
      {
        name: "Grant permissions on smtp_settings",
        sql: `GRANT ALL ON smtp_settings TO anon, authenticated, service_role;`,
      },
      {
        name: "Grant permissions on email_categories",
        sql: `GRANT ALL ON email_categories TO anon, authenticated, service_role;`,
      },
      {
        name: "Grant permissions on tenants",
        sql: `GRANT ALL ON tenants TO anon, authenticated, service_role;`,
      },
      {
        name: "Grant permissions on user_profiles",
        sql: `GRANT ALL ON user_profiles TO anon, authenticated, service_role;`,
      },
      {
        name: "Grant permissions on user_tenants",
        sql: `GRANT ALL ON user_tenants TO anon, authenticated, service_role;`,
      },
      {
        name: "Grant permissions on conversations",
        sql: `GRANT ALL ON conversations TO anon, authenticated, service_role;`,
      },
      {
        name: "Grant permissions on sync_agents",
        sql: `GRANT ALL ON sync_agents TO anon, authenticated, service_role;`,
      },
    ];

    for (const migration of migrations) {
      console.log(`Running: ${migration.name}`);
      try {
        await client.query(migration.sql);
        console.log(`  ✓ Done`);
      } catch (error) {
        console.log(`  ✗ Error: ${error instanceof Error ? error.message : "Unknown"}`);
      }
    }

    // Notify PostgREST to reload schema
    console.log("\nReloading schema cache...");
    try {
      await client.query("NOTIFY pgrst, 'reload schema';");
      console.log("  ✓ Schema cache reload requested");
    } catch {
      console.log("  - Skipped (may not be needed)");
    }

    // Diagnostic: Check message content status
    console.log("\n--- Diagnostics ---");
    try {
      const totalResult = await client.query("SELECT COUNT(*) FROM messages");
      const nullContentResult = await client.query("SELECT COUNT(*) FROM messages WHERE content IS NULL");
      const hasContentResult = await client.query("SELECT COUNT(*) FROM messages WHERE content IS NOT NULL AND content != ''");

      // Check sample messages
      const sampleResult = await client.query(`
        SELECT id, content, sender_name, tenant_id, conversation_id
        FROM messages
        ORDER BY sent_at DESC
        LIMIT 3
      `);
      console.log("\nSample messages:");
      for (const row of sampleResult.rows) {
        console.log(`  ID: ${row.id.slice(0,8)}... tenant: ${row.tenant_id?.slice(0,8) || 'NULL'} content: "${(row.content || '').slice(0, 50)}..."`);
      }

      // Check conversations
      const convResult = await client.query(`
        SELECT c.id, c.tenant_id, c.message_count,
               (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as actual_msg_count
        FROM conversations c
        LIMIT 3
      `);
      console.log("\nConversations:");
      for (const row of convResult.rows) {
        console.log(`  ID: ${row.id.slice(0,8)}... tenant: ${row.tenant_id?.slice(0,8) || 'NULL'} count: ${row.message_count} actual: ${row.actual_msg_count}`);
      }

      // Check extensions
      const extResult = await client.query("SELECT COUNT(*) FROM extensions");
      console.log(`\nTotal extensions: ${extResult.rows[0].count}`);
      const extSampleResult = await client.query(`
        SELECT id, extension_number, display_name, tenant_id
        FROM extensions
        LIMIT 3
      `);
      console.log("Sample extensions:");
      for (const row of extSampleResult.rows) {
        console.log(`  Ext: ${row.extension_number} Name: ${row.display_name || 'NULL'} Tenant: ${row.tenant_id?.slice(0,8) || 'NULL'}`);
      }

      // Check tenants
      const tenantResult = await client.query("SELECT id, name, slug FROM tenants");
      console.log("\nTenants:");
      for (const row of tenantResult.rows) {
        console.log(`  ID: ${row.id.slice(0,8)}... Name: ${row.name} Slug: ${row.slug}`);
      }

      console.log(`Total messages: ${totalResult.rows[0].count}`);
      console.log(`Messages with content: ${hasContentResult.rows[0].count}`);
      console.log(`Messages with NULL content: ${nullContentResult.rows[0].count}`);

      // Check if there's a message_text column with data
      try {
        const messageTextResult = await client.query(`
          SELECT COUNT(*) FROM messages WHERE message_text IS NOT NULL AND message_text != ''
        `);
        console.log(`Messages with message_text column data: ${messageTextResult.rows[0].count}`);

        // Migrate message_text to content if needed
        if (parseInt(messageTextResult.rows[0].count) > 0 && parseInt(nullContentResult.rows[0].count) > 0) {
          console.log("\nMigrating message_text to content...");
          await client.query(`
            UPDATE messages
            SET content = message_text
            WHERE content IS NULL AND message_text IS NOT NULL
          `);
          console.log("  ✓ Migration complete");
        }
      } catch {
        console.log("  (message_text column doesn't exist - skipping)");
      }
    } catch (error) {
      console.log(`  Diagnostic error: ${error instanceof Error ? error.message : "Unknown"}`);
    }

    // Check if we need to reset sync to re-fetch messages
    const args = process.argv.slice(2);
    if (args.includes("--reset-sync")) {
      console.log("\n--- Resetting sync status ---");
      try {
        // Delete all messages to force re-sync
        await client.query("DELETE FROM messages");
        console.log("  ✓ Deleted all messages");

        // Reset sync status
        await client.query(`
          UPDATE sync_status
          SET last_sync_at = NULL,
              last_success_at = NULL,
              items_synced = 0
          WHERE sync_type = 'messages'
        `);
        console.log("  ✓ Reset sync timestamp - messages will re-sync");
      } catch (error) {
        console.log(`  Error: ${error instanceof Error ? error.message : "Unknown"}`);
      }
    }

    console.log("\n✓ Migration complete!");
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
