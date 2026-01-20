// Add last_synced_message_at column to sync_status table
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function addColumn() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Add the column using raw SQL via RPC or just check if it exists
  // Since we can't run DDL via supabase-js, we'll just verify the structure

  console.log('Checking sync_status table structure...');

  const { data, error } = await supabase
    .from('sync_status')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Current columns in sync_status:', data ? Object.keys(data[0] || {}) : 'empty table');
  console.log('\nTo add the column, run this SQL in Supabase Dashboard:');
  console.log(`
ALTER TABLE sync_status
ADD COLUMN IF NOT EXISTS last_synced_message_at TIMESTAMPTZ;
  `);
}

addColumn().then(() => process.exit(0));
