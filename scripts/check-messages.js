require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Get the first tenant
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('is_active', true)
    .limit(1);

  const tenant = tenants[0];
  console.log('Checking tenant:', tenant.name, tenant.id);

  // Get conversations for this tenant
  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select('id, conversation_name, message_count, threecx_conversation_id')
    .eq('tenant_id', tenant.id)
    .order('message_count', { ascending: false })
    .limit(5);

  if (convError) {
    console.error('Error fetching conversations:', convError);
    return;
  }

  console.log('\nTop conversations by message count:');
  for (const conv of conversations) {
    console.log(`  ${conv.conversation_name || 'Unnamed'}: ${conv.message_count} msgs (3CX ID: ${conv.threecx_conversation_id})`);

    // Get actual message count from messages table
    const { count: actualCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conv.id);

    console.log(`    Actual messages in DB: ${actualCount}`);

    // Check if tenant_id matches
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, tenant_id, sent_at')
      .eq('conversation_id', conv.id)
      .limit(3);

    if (msgs && msgs.length > 0) {
      console.log(`    Sample messages:`, msgs.map(m => ({ id: m.id.substring(0,8), tenant: m.tenant_id === tenant.id ? 'matches' : 'MISMATCH', sent_at: m.sent_at })));
    }
  }

  // Check participants table schema
  console.log('\n--- Checking participants table columns ---');
  const { data: samplePart } = await supabase
    .from('participants')
    .select('*')
    .limit(1);

  if (samplePart && samplePart.length > 0) {
    console.log('Participant columns:', Object.keys(samplePart[0]));
  }
}

check().catch(console.error);
