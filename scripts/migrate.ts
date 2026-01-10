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

    console.log("\n✓ Migration complete!");
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
