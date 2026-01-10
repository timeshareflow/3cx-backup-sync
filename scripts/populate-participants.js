/**
 * Script to populate the participants table from existing messages.
 * Run this after initial sync to ensure conversations have participant data.
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:mlyR5A1Scok1bypH@db.slnxhfgvkdkwpjfrwpdm.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function populateParticipants() {
  console.log('=== Populating Participants Table ===\n');

  try {
    // Get all unique sender identifiers from messages, grouped by conversation
    const senderQuery = await pool.query(`
      SELECT DISTINCT
        m.conversation_id,
        m.sender_identifier,
        m.sender_name,
        c.tenant_id
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.sender_identifier IS NOT NULL
      ORDER BY m.conversation_id, m.sender_identifier
    `);

    console.log(`Found ${senderQuery.rows.length} unique sender entries to process\n`);

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of senderQuery.rows) {
      try {
        // Try to find matching extension
        const extQuery = await pool.query(`
          SELECT id, extension_number, display_name
          FROM extensions
          WHERE extension_number = $1 AND tenant_id = $2
          LIMIT 1
        `, [row.sender_identifier, row.tenant_id]);

        const extension = extQuery.rows[0];

        // Check if participant already exists
        const existingQuery = await pool.query(`
          SELECT id FROM participants
          WHERE conversation_id = $1 AND (
            extension_id = $2 OR
            external_id = $3
          )
          LIMIT 1
        `, [row.conversation_id, extension?.id || null, row.sender_identifier]);

        if (existingQuery.rows.length > 0) {
          skipped++;
          continue;
        }

        // Insert participant
        const displayName = row.sender_name || extension?.display_name || row.sender_identifier;

        await pool.query(`
          INSERT INTO participants (
            conversation_id,
            extension_id,
            external_id,
            external_name,
            external_number,
            participant_type,
            joined_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
          row.conversation_id,
          extension?.id || null,
          row.sender_identifier,
          displayName,
          extension ? null : row.sender_identifier,  // external_number for non-extensions
          extension ? 'extension' : 'external'
        ]);

        inserted++;
        console.log(`  + ${displayName} (${row.sender_identifier}) -> conversation ${row.conversation_id.slice(0, 8)}...`);
      } catch (err) {
        errors++;
        console.error(`  ! Error processing ${row.sender_identifier}:`, err.message);
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Inserted: ${inserted}`);
    console.log(`Skipped (already exists): ${skipped}`);
    console.log(`Errors: ${errors}`);

    // Verify
    const countQuery = await pool.query('SELECT COUNT(*) as count FROM participants');
    console.log(`\nTotal participants now: ${countQuery.rows[0].count}`);

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

populateParticipants();
