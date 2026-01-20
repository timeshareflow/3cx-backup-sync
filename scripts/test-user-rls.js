require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Get the super_admin user details
  const { data: superAdmin } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('role', 'super_admin')
    .single();

  console.log('Super admin user:', {
    id: superAdmin?.id,
    email: superAdmin?.email,
    role: superAdmin?.role,
    is_active: superAdmin?.is_active
  });

  // Check if is_active is set properly
  if (superAdmin?.is_active === false || superAdmin?.is_active === null) {
    console.log('\n!!! is_active is not TRUE - this is the problem!');
    console.log('Fixing by setting is_active = TRUE...');

    const { error } = await supabase
      .from('user_profiles')
      .update({ is_active: true })
      .eq('id', superAdmin.id);

    if (error) {
      console.error('Failed to update:', error);
    } else {
      console.log('Fixed! is_active is now TRUE');
    }
  }

  // Also add them to user_tenants for the tenant (as a backup approach)
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('is_active', true);

  console.log('\nActive tenants:', tenants?.map(t => t.name));

  // Check if super_admin is in user_tenants
  const { data: userTenants } = await supabase
    .from('user_tenants')
    .select('tenant_id')
    .eq('user_id', superAdmin?.id);

  if (!userTenants || userTenants.length === 0) {
    console.log('\nSuper admin has no tenant associations. Adding them...');

    for (const t of tenants || []) {
      const { error } = await supabase
        .from('user_tenants')
        .upsert({
          user_id: superAdmin?.id,
          tenant_id: t.id,
          role: 'admin'
        }, {
          onConflict: 'user_id,tenant_id'
        });

      if (error) {
        console.error(`Failed to add tenant ${t.name}:`, error.message);
      } else {
        console.log(`Added super_admin to tenant: ${t.name}`);
      }
    }
  }

  console.log('\nDone! Please refresh the page and try again.');
}

test().catch(console.error);
