const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://slnxhfgvkdkwpjfrwpdm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbnhoZmd2a2Rrd3BqZnJ3cGRtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAwMTAzMiwiZXhwIjoyMDgzNTc3MDMyfQ.UmMXhowvL7KoB0ss9V3ZCe4LJ1_EDwlYbmMg11_UOY8'
);

async function checkFiles() {
  const tenantId = '4c723c9c-a5c3-45bf-a4f4-5505e11ee3b4';

  // List folders in tenant
  const { data: folders, error } = await supabase.storage
    .from('backupwiz-files')
    .list(tenantId, { limit: 100 });

  console.log('Folders in tenant:', folders?.length || 0);

  for (const folder of (folders || [])) {
    console.log('\nFolder:', folder.name);

    // List files in subfolder
    const { data: files } = await supabase.storage
      .from('backupwiz-files')
      .list(tenantId + '/' + folder.name, { limit: 100 });

    console.log('  Items:', files?.length || 0);

    // Show first few files
    for (const f of (files || []).slice(0, 5)) {
      console.log('    -', f.name, f.metadata ? `(${(f.metadata.size / 1024).toFixed(1)}KB)` : '(folder)');
    }
    if ((files || []).length > 5) {
      console.log('    ... and', files.length - 5, 'more');
    }
  }

  // Also check database tables
  console.log('\n\n=== Database Tables ===');

  const tables = ['extensions', 'conversations', 'messages', 'media_files', 'recordings', 'voicemails', 'faxes', 'cdr_records'];

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.log(table + ':', 'Error -', error.message);
    } else {
      console.log(table + ':', count || 0);
    }
  }
}

checkFiles();
