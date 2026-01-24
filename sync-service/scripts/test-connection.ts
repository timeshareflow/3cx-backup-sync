/**
 * Connection Test Script
 *
 * Tests connectivity to a 3CX server from the sync service.
 * Usage: npx ts-node scripts/test-connection.ts
 *
 * This script:
 * 1. Loads tenant config from Supabase
 * 2. Tests DNS resolution
 * 3. Tests TCP connectivity
 * 4. Tests SSH connection
 * 5. Tests PostgreSQL connection through SSH tunnel
 */

import dotenv from "dotenv";
import * as dns from "dns";
import * as net from "net";
import { promisify } from "util";
import { Client } from "ssh2";
import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const dnsLookup = promisify(dns.lookup);

interface TenantConfig {
  id: string;
  name: string;
  slug: string;
  threecx_host: string;
  ssh_port: number;
  ssh_user: string;
  ssh_password: string;
  threecx_db_password: string;
}

async function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key);
}

async function testDns(host: string): Promise<boolean> {
  console.log(`\n[1/4] Testing DNS resolution for ${host}...`);
  try {
    const result = await dnsLookup(host);
    console.log(`  ✓ DNS resolved to ${result.address}`);
    return true;
  } catch (error) {
    console.log(`  ✗ DNS resolution failed: ${(error as Error).message}`);
    return false;
  }
}

async function testTcp(host: string, port: number): Promise<boolean> {
  console.log(`\n[2/4] Testing TCP connection to ${host}:${port}...`);
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      console.log(`  ✗ TCP connection timed out after 15 seconds`);
      resolve(false);
    }, 15000);

    socket.on("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      console.log(`  ✓ TCP connection successful`);
      resolve(true);
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      socket.destroy();
      console.log(`  ✗ TCP connection failed: ${err.message}`);
      resolve(false);
    });

    socket.connect(port, host);
  });
}

async function testSsh(config: TenantConfig): Promise<{ success: boolean; localPort?: number }> {
  console.log(`\n[3/4] Testing SSH connection to ${config.threecx_host}:${config.ssh_port}...`);
  console.log(`  User: ${config.ssh_user}`);

  return new Promise((resolve) => {
    const client = new Client();

    const timeout = setTimeout(() => {
      client.end();
      console.log(`  ✗ SSH connection timed out after 60 seconds`);
      resolve({ success: false });
    }, 60000);

    client.on("ready", () => {
      clearTimeout(timeout);
      console.log(`  ✓ SSH connection established`);

      // Create SSH tunnel to PostgreSQL
      const localPort = 15432;
      const server = net.createServer((socket) => {
        client.forwardOut(
          "127.0.0.1",
          localPort,
          "127.0.0.1",
          5432,
          (err, stream) => {
            if (err) {
              socket.end();
              return;
            }
            socket.pipe(stream).pipe(socket);
          }
        );
      });

      server.listen(localPort, "127.0.0.1", () => {
        console.log(`  ✓ SSH tunnel established on local port ${localPort}`);
        resolve({ success: true, localPort });
      });
    });

    client.on("error", (err) => {
      clearTimeout(timeout);
      console.log(`  ✗ SSH connection failed: ${err.message}`);
      resolve({ success: false });
    });

    client.connect({
      host: config.threecx_host,
      port: config.ssh_port,
      username: config.ssh_user,
      password: config.ssh_password,
      readyTimeout: 60000,
    });
  });
}

async function testPostgres(localPort: number, password: string): Promise<boolean> {
  console.log(`\n[4/4] Testing PostgreSQL connection through SSH tunnel...`);

  const pool = new Pool({
    host: "127.0.0.1",
    port: localPort,
    database: "database_single",
    user: "phonesystem",
    password: password,
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();
    const result = await client.query("SELECT COUNT(*) FROM chat_messages");
    client.release();
    console.log(`  ✓ PostgreSQL connection successful`);
    console.log(`  ✓ Found ${result.rows[0].count} chat messages in database`);
    await pool.end();
    return true;
  } catch (error) {
    console.log(`  ✗ PostgreSQL connection failed: ${(error as Error).message}`);
    await pool.end();
    return false;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("3CX BackupWiz - Connection Test");
  console.log("=".repeat(60));

  // Get tenant config from Supabase
  console.log("\nFetching tenant configuration from Supabase...");
  const supabase = await getSupabaseClient();

  const { data: tenants, error } = await supabase
    .from("tenants")
    .select(`
      id, name, slug, threecx_host,
      ssh_port, ssh_user, ssh_password, threecx_db_password,
      sftp_port, sftp_user, sftp_password, threecx_password
    `)
    .eq("is_active", true)
    .eq("sync_enabled", true)
    .not("threecx_host", "is", null);

  if (error) {
    console.error(`Failed to fetch tenants: ${error.message}`);
    process.exit(1);
  }

  if (!tenants || tenants.length === 0) {
    console.log("No active tenants found with 3CX configuration");
    process.exit(1);
  }

  console.log(`Found ${tenants.length} tenant(s)`);

  for (const rawTenant of tenants) {
    const tenant: TenantConfig = {
      id: rawTenant.id,
      name: rawTenant.name,
      slug: rawTenant.slug,
      threecx_host: rawTenant.threecx_host,
      ssh_port: rawTenant.ssh_port ?? rawTenant.sftp_port ?? 22,
      ssh_user: rawTenant.ssh_user || rawTenant.sftp_user,
      ssh_password: rawTenant.ssh_password || rawTenant.sftp_password,
      threecx_db_password: rawTenant.threecx_db_password || rawTenant.threecx_password,
    };

    console.log("\n" + "=".repeat(60));
    console.log(`Testing tenant: ${tenant.name} (${tenant.slug})`);
    console.log(`Host: ${tenant.threecx_host}:${tenant.ssh_port}`);
    console.log("=".repeat(60));

    // Check required credentials
    if (!tenant.ssh_user || !tenant.ssh_password || !tenant.threecx_db_password) {
      console.log("\n✗ Missing required credentials:");
      if (!tenant.ssh_user) console.log("  - SSH user not configured");
      if (!tenant.ssh_password) console.log("  - SSH password not configured");
      if (!tenant.threecx_db_password) console.log("  - Database password not configured");
      continue;
    }

    // Run tests
    const dnsOk = await testDns(tenant.threecx_host);
    if (!dnsOk) {
      console.log("\n✗ Cannot proceed - DNS resolution failed");
      continue;
    }

    const tcpOk = await testTcp(tenant.threecx_host, tenant.ssh_port);
    if (!tcpOk) {
      console.log("\n✗ Cannot proceed - TCP connection failed");
      console.log("\nPossible causes:");
      console.log("  - SSH is disabled on the 3CX server");
      console.log("  - Firewall is blocking port 22");
      console.log("  - The 3CX server is unreachable from this network");
      continue;
    }

    const sshResult = await testSsh(tenant);
    if (!sshResult.success) {
      console.log("\n✗ Cannot proceed - SSH connection failed");
      console.log("\nPossible causes:");
      console.log("  - SSH username or password is incorrect");
      console.log("  - SSH authentication method not supported");
      console.log("  - Server is rejecting the connection");
      continue;
    }

    if (sshResult.localPort) {
      await testPostgres(sshResult.localPort, tenant.threecx_db_password);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Connection test complete");
  console.log("=".repeat(60));

  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
