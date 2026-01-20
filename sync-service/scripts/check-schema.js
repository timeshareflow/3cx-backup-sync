require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Client: SshClient } = require('ssh2');
const { Pool } = require('pg');
const net = require('net');

async function check() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: tenants } = await supabase
    .from('tenants')
    .select('*')
    .eq('is_active', true)
    .limit(1);

  const tenant = tenants[0];
  console.log('Checking schema for tenant:', tenant.name);

  return new Promise((resolve) => {
    const ssh = new SshClient();

    ssh.on('ready', () => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        server.close();

        const proxy = net.createServer((socket) => {
          ssh.forwardOut('127.0.0.1', port, '127.0.0.1', 5432, (err, stream) => {
            if (err) { socket.end(); return; }
            socket.pipe(stream).pipe(socket);
          });
        });

        proxy.listen(port, '127.0.0.1', async () => {
          const pool = new Pool({
            host: '127.0.0.1',
            port,
            database: 'database_single',
            user: 'phonesystem',
            password: tenant.threecx_db_password,
            max: 1,
          });

          try {
            // Get column info for chat_conversation table
            const result = await pool.query(`
              SELECT column_name, data_type
              FROM information_schema.columns
              WHERE table_name = 'chat_conversation'
              ORDER BY ordinal_position
            `);

            console.log('\nchat_conversation table columns:');
            result.rows.forEach(r => {
              console.log('  ' + r.column_name + ' (' + r.data_type + ')');
            });

            // Get a sample row to see what's in there
            const sample = await pool.query('SELECT * FROM chat_conversation LIMIT 1');
            console.log('\nSample row keys:', Object.keys(sample.rows[0] || {}));

          } finally {
            await pool.end();
            proxy.close();
            ssh.end();
            resolve(null);
          }
        });
      });
    });

    ssh.connect({
      host: tenant.threecx_host,
      port: tenant.ssh_port || 22,
      username: tenant.ssh_user,
      password: tenant.ssh_password,
    });
  });
}

check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
