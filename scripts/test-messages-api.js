require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Get tenant
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('is_active', true)
    .limit(1);

  const tenant = tenants[0];
  console.log('Testing with tenant:', tenant.name);

  // Get a conversation with messages
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, conversation_name, message_count')
    .eq('tenant_id', tenant.id)
    .gt('message_count', 0)
    .order('message_count', { ascending: false })
    .limit(1);

  if (!conversations || conversations.length === 0) {
    console.log('No conversations found');
    return;
  }

  const conv = conversations[0];
  console.log('Testing conversation:', conv.conversation_name, 'with', conv.message_count, 'messages');
  console.log('Conversation ID:', conv.id);

  // Test the exact query the API does
  console.log('\n--- Testing messages query (same as API) ---');
  const { data: messages, error, count } = await supabase
    .from('messages')
    .select(`
      id,
      conversation_id,
      threecx_message_id,
      sender_identifier,
      sender_name,
      content,
      message_type,
      has_media,
      sent_at,
      created_at,
      media_files (*)
    `, { count: 'exact' })
    .eq('conversation_id', conv.id)
    .order('sent_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('Query error:', error);
    return;
  }

  console.log('Total count:', count);
  console.log('Messages returned:', messages?.length || 0);

  if (messages && messages.length > 0) {
    console.log('\nFirst message:', {
      id: messages[0].id.substring(0, 8),
      sent_at: messages[0].sent_at,
      sender: messages[0].sender_name || messages[0].sender_identifier,
      content: messages[0].content?.substring(0, 50),
      has_media: messages[0].has_media,
      media_files: messages[0].media_files?.length || 0
    });
  }

  // Also check if there's an RLS issue - compare service role vs anon key
  console.log('\n--- Testing with anon key (to check RLS) ---');
  const anonSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: anonMessages, error: anonError, count: anonCount } = await anonSupabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conv.id);

  if (anonError) {
    console.log('Anon query error (expected if RLS blocks):', anonError.message);
  } else {
    console.log('Anon query count:', anonCount);
  }
}

test().catch(console.error);
