import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function fix() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL not set");
  }

  const client = postgres(connectionString);
  const db = drizzle(client);

  try {
    // 1. Add unique constraint to sync_status if missing
    console.log("1. Adding unique constraint to sync_status...");
    try {
      await db.execute(sql`
        ALTER TABLE sync_status
        DROP CONSTRAINT IF EXISTS sync_status_tenant_id_sync_type_key
      `);
      await db.execute(sql`
        ALTER TABLE sync_status
        ADD CONSTRAINT sync_status_tenant_id_sync_type_key
        UNIQUE (tenant_id, sync_type)
      `);
      console.log("   ✓ Unique constraint added");
    } catch (e) {
      console.log("   Note:", (e as Error).message);
    }

    // 2. Check messages table structure
    console.log("\n2. Checking messages table structure...");
    const cols = await db.execute(sql`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'messages'
      ORDER BY ordinal_position
    `);
    console.log("   Messages columns:");
    for (const col of cols) {
      const c = col as { column_name: string; is_nullable: string; data_type: string };
      console.log(`     ${c.column_name}: ${c.data_type} ${c.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
    }

    // 3. Check for any messages that might be blocking
    console.log("\n3. Checking existing messages count...");
    const msgCount = await db.execute(sql`SELECT COUNT(*) as count FROM messages`);
    console.log("   Current messages:", (msgCount[0] as { count: number }).count);

    console.log("\n✓ Done checking. If messages still fail, check if all required columns have values.");

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.end();
  }
}

fix();
