require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Get all user profiles
  const { data: users } = await supabase
    .from('user_profiles')
    .select('id, email, role');

  console.log('Users in system:');
  for (const u of users || []) {
    console.log(`  ${u.email} - role: ${u.role}`);

    // Check their tenant associations
    const { data: tenants } = await supabase
      .from('user_tenants')
      .select('tenant_id, role, tenants(name)')
      .eq('user_id', u.id);

    if (tenants && tenants.length > 0) {
      console.log('    Tenant access:');
      tenants.forEach(t => {
        console.log(`      - ${t.tenants?.name || t.tenant_id} (role: ${t.role})`);
      });
    } else {
      console.log('    No tenant associations');
    }
  }

  // Test the RLS functions directly
  console.log('\n--- Testing RLS functions ---');

  // Get the first user
  const { data: firstUser } = await supabase
    .from('user_profiles')
    .select('id, email, role')
    .limit(1)
    .single();

  if (firstUser) {
    console.log('Testing as user:', firstUser.email);

    // Call the is_super_admin function for this user
    const { data: isSuperAdmin, error: saError } = await supabase.rpc('is_super_admin');
    console.log('is_super_admin() result:', isSuperAdmin, saError?.message);

    // Call get_user_tenant_ids
    const { data: tenantIds, error: tiError } = await supabase.rpc('get_user_tenant_ids');
    console.log('get_user_tenant_ids() result:', tenantIds, tiError?.message);
  }

  // Check if the messages table has proper RLS policies
  console.log('\n--- RLS Policy Check ---');
  const { data: policies } = await supabase
    .from('pg_policies')
    .select('*')
    .eq('tablename', 'messages');

  // This won't work directly, let's do it differently
  console.log('Checking messages directly with service role (should work):');
  const { count: serviceCount } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true });
  console.log('  Service role message count:', serviceCount);
}

test().catch(console.error);
