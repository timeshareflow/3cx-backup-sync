import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function addColumn() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL not set");
  }

  const client = postgres(connectionString);
  const db = drizzle(client);

  console.log("Adding last_synced_message_at column to sync_status table...");

  try {
    await db.execute(sql`
      ALTER TABLE sync_status
      ADD COLUMN IF NOT EXISTS last_synced_message_at TIMESTAMPTZ
    `);
    console.log("Column added successfully!");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.end();
  }
}

addColumn();
