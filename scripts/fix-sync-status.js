// Run from sync-service directory to use its .env
const path = require('path');
const dotenv = require('dotenv');

// Load sync-service .env
dotenv.config({ path: path.join(__dirname, '..', 'sync-service', '.env') });

const { createClient } = require('@supabase/supabase-js');

async function run() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log('Connected to Supabase');

  // Check current state of sync_status
  const { data: syncData, error: syncError } = await supabase
    .from('sync_status')
    .select('*');

  if (syncError) {
    console.error('Error fetching sync_status:', syncError.message);
  } else {
    console.log('sync_status rows:', syncData?.length || 0);
    console.log('Data:', JSON.stringify(syncData, null, 2));
  }

  // Try a test upsert to see if it works now
  const testTenantId = syncData?.[0]?.tenant_id;
  if (testTenantId) {
    console.log('\nTesting upsert for tenant:', testTenantId);

    const { error: upsertError } = await supabase
      .from('sync_status')
      .upsert({
        tenant_id: testTenantId,
        sync_type: 'test',
        status: 'idle',
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'tenant_id,sync_type'
      });

    if (upsertError) {
      console.error('Upsert error:', upsertError.message, upsertError.code);
      console.error('Full error:', upsertError);

      if (upsertError.code === '42P10') {
        console.log('\n*** CONFIRMED: Missing unique constraint on sync_status(tenant_id, sync_type) ***');
        console.log('Need to run migration to add constraint');
      }
    } else {
      console.log('Upsert succeeded! Constraint exists.');

      // Clean up test row
      await supabase
        .from('sync_status')
        .delete()
        .eq('tenant_id', testTenantId)
        .eq('sync_type', 'test');
    }
  }
}

run().catch(console.error);
