import { Client } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL in .env.local");
  process.exit(1);
}

async function runMigrations() {
  const client = new Client({ connectionString: databaseUrl });

  try {
    console.log("Connecting to database...");
    await client.connect();
    console.log("Connected!\n");

    // List of migration files to run (in order)
    const migrationFiles = [
      "20260126_add_sendgrid.sql",
      "20260126_add_email_categories.sql",
      "20260126_customer_type_and_user_fields.sql",
    ];

    for (const fileName of migrationFiles) {
      const filePath = path.join(__dirname, "..", "supabase", "migrations", fileName);

      if (!fs.existsSync(filePath)) {
        console.log(`⚠ Migration file not found: ${fileName}`);
        continue;
      }

      console.log(`Running migration: ${fileName}`);
      const sql = fs.readFileSync(filePath, "utf-8");

      try {
        await client.query(sql);
        console.log(`  ✓ ${fileName} completed`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        // Ignore "already exists" errors
        if (errMsg.includes("already exists") || errMsg.includes("duplicate")) {
          console.log(`  ✓ ${fileName} (already applied)`);
        } else {
          console.log(`  ✗ ${fileName} failed: ${errMsg}`);
        }
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

    console.log("\n✓ Migrations complete!");
  } finally {
    await client.end();
  }
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
