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
  console.log('Checking for participant tables:', tenant.name);

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
            // Find all tables/views related to chat
            const tables = await pool.query(`
              SELECT table_name, table_type
              FROM information_schema.tables
              WHERE table_schema = 'public'
              AND (table_name LIKE '%chat%' OR table_name LIKE '%participant%')
              ORDER BY table_name
            `);

            console.log('\nChat-related tables/views:');
            tables.rows.forEach(r => {
              console.log('  ' + r.table_name + ' (' + r.table_type + ')');
            });

            // Check chat_participant table if exists
            try {
              const partSchema = await pool.query(`
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'chat_participant'
                ORDER BY ordinal_position
              `);
              console.log('\nchat_participant columns:');
              partSchema.rows.forEach(r => {
                console.log('  ' + r.column_name + ' (' + r.data_type + ')');
              });

              // Sample data
              const partSample = await pool.query('SELECT * FROM chat_participant LIMIT 3');
              console.log('\nSample chat_participant rows:');
              partSample.rows.forEach(r => console.log('  ', r));
            } catch (e) {
              console.log('\nchat_participant table does not exist or is empty');
            }

            // Check what's in the history views that we're missing
            try {
              const histSchema = await pool.query(`
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'chat_history_view'
                ORDER BY ordinal_position
              `);
              console.log('\nchat_history_view columns:');
              histSchema.rows.forEach(r => {
                console.log('  ' + r.column_name + ' (' + r.data_type + ')');
              });
            } catch (e) {
              console.log('\nchat_history_view does not exist');
            }

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
