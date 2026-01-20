const { Pool } = require('pg');
require('dotenv').config();

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('Connected to database');

    // Check current state of sync_status
    const result = await client.query(`
      SELECT COUNT(*) as count
      FROM sync_status
    `);
    console.log('sync_status rows:', result.rows[0].count);

    // Check for duplicates
    const dupes = await client.query(`
      SELECT tenant_id, sync_type, COUNT(*) as cnt
      FROM sync_status
      GROUP BY tenant_id, sync_type
      HAVING COUNT(*) > 1
    `);
    console.log('Duplicates:', dupes.rows);

    // Check if unique constraint exists
    const constraints = await client.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'sync_status'::regclass
      AND contype = 'u'
    `);
    console.log('Existing unique constraints:', constraints.rows.map(r => r.conname));

    // Check if unique index exists
    const indexes = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'sync_status'
      AND indexdef LIKE '%UNIQUE%'
    `);
    console.log('Existing unique indexes:', indexes.rows.map(r => r.indexname));

    // If no unique constraint, add it
    if (constraints.rows.length === 0 && indexes.rows.length === 0) {
      console.log('Adding unique constraint...');

      // First remove duplicates
      await client.query(`
        DELETE FROM sync_status a
        USING sync_status b
        WHERE a.id < b.id
          AND a.tenant_id = b.tenant_id
          AND a.sync_type = b.sync_type
      `);

      // Add unique constraint
      await client.query(`
        ALTER TABLE sync_status
        ADD CONSTRAINT sync_status_tenant_sync_type_unique
        UNIQUE (tenant_id, sync_type)
      `);
      console.log('Unique constraint added successfully!');
    } else {
      console.log('Unique constraint already exists');
    }

    client.release();
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Details:', err);
  } finally {
    await pool.end();
  }
}

run();
