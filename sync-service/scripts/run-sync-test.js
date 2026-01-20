require('dotenv').config();
const { runMultiTenantSync } = require('../dist/sync/index.js');

console.log('Running sync to test the fix...');
console.log('This will sync all conversations including empty ones.');

runMultiTenantSync({ skipMedia: true, skipExtensions: true })
  .then(result => {
    console.log('\n=== SYNC COMPLETED ===');
    for (const r of result.results) {
      console.log(`\nTenant: ${r.tenantName}`);
      console.log(`  Success: ${r.success}`);
      console.log(`  Conversations created: ${r.messages.conversationsCreated}`);
      console.log(`  Messages synced: ${r.messages.messagesSynced}`);
      if (r.error) console.log(`  Error: ${r.error}`);
    }
    console.log('\nTotal duration:', result.totalDuration + 'ms');
    process.exit(0);
  })
  .catch(err => {
    console.error('Sync failed:', err.message);
    process.exit(1);
  });
