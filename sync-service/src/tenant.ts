import { Pool } from "pg";
import { getSupabaseClient } from "./storage/supabase";
import { logger } from "./utils/logger";
import { SftpConfig } from "./storage/sftp";
import { createSshTunnel, closeTunnel, closeAllTunnels as closeAllSshTunnels } from "./ssh-tunnel";

export interface TenantConfig {
  id: string;
  name: string;
  slug: string;
  // 3CX Server Host (used for SSH connection)
  threecx_host: string | null;
  // SSH credentials (used for both tunnel and SFTP - ONE set of credentials)
  ssh_port: number | null;
  ssh_user: string | null;
  ssh_password: string | null;
  // PostgreSQL password only (connects via SSH tunnel to localhost:5432)
  threecx_db_password: string | null;
  // File paths on 3CX server
  threecx_chat_files_path: string | null;
  threecx_recordings_path: string | null;
  threecx_voicemail_path: string | null;
  threecx_fax_path: string | null;
  threecx_meetings_path: string | null;
  // Backup settings
  backup_chats: boolean;
  backup_chat_media: boolean;
  backup_recordings: boolean;
  backup_voicemails: boolean;
  backup_faxes: boolean;
  backup_cdr: boolean;
  backup_meetings: boolean;
  // Status
  is_active: boolean;
  sync_enabled: boolean;
}

// Cache for tenant database pools
const tenantPools: Map<string, Pool> = new Map();

export async function getActiveTenants(): Promise<TenantConfig[]> {
  const supabase = getSupabaseClient();

  const { data: tenants, error } = await supabase
    .from("tenants")
    .select(`
      id, name, slug,
      threecx_host,
      ssh_port, ssh_user, ssh_password,
      threecx_db_password,
      threecx_chat_files_path, threecx_recordings_path, threecx_voicemail_path, threecx_fax_path, threecx_meetings_path,
      backup_chats, backup_chat_media, backup_recordings, backup_voicemails, backup_faxes, backup_cdr, backup_meetings,
      is_active, sync_enabled
    `)
    .eq("is_active", true)
    .eq("sync_enabled", true)
    .not("threecx_host", "is", null);

  if (error) {
    logger.error("Failed to fetch active tenants", { error: error.message });
    throw new Error(`Failed to fetch tenants: ${error.message}`);
  }

  return tenants || [];
}

export async function getTenantPool(tenant: TenantConfig): Promise<Pool | null> {
  if (!tenant.threecx_host || !tenant.ssh_user || !tenant.ssh_password || !tenant.threecx_db_password) {
    logger.warn(`Tenant ${tenant.slug} missing connection credentials`, { tenantId: tenant.id });
    return null;
  }

  // Check if we already have a pool for this tenant
  if (tenantPools.has(tenant.id)) {
    return tenantPools.get(tenant.id)!;
  }

  try {
    // First, establish SSH tunnel to the 3CX server
    // This tunnels localhost:localPort -> 3CXServer:5432 via SSH
    const tunnel = await createSshTunnel(tenant.id, {
      sshHost: tenant.threecx_host,
      sshPort: tenant.ssh_port || 22,
      sshUsername: tenant.ssh_user,
      sshPassword: tenant.ssh_password,
      remoteHost: "127.0.0.1",  // PostgreSQL listens on localhost on the 3CX server
      remotePort: 5432,
    });

    // Create pool connecting through the SSH tunnel
    const pool = new Pool({
      host: "127.0.0.1",
      port: tunnel.localPort,  // Connect to local end of SSH tunnel
      database: "database_single",  // 3CX default database
      user: "phonesystem",  // 3CX default user
      password: tenant.threecx_db_password,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      ssl: false,
    });

    pool.on("error", (err) => {
      logger.error(`Tenant ${tenant.slug} database pool error`, {
        tenantId: tenant.id,
        error: err.message,
      });
    });

    tenantPools.set(tenant.id, pool);

    logger.info(`Created database pool for tenant ${tenant.slug} via SSH tunnel`, {
      tenantId: tenant.id,
      host: tenant.threecx_host,
      tunnelPort: tunnel.localPort,
    });

    return pool;
  } catch (error) {
    logger.error(`Failed to create SSH tunnel for tenant ${tenant.slug}`, {
      tenantId: tenant.id,
      host: tenant.threecx_host,
      error: (error as Error).message,
    });
    return null;
  }
}

export function getTenantSftpConfig(tenant: TenantConfig): SftpConfig | null {
  // Use same SSH credentials for SFTP (they're the same connection)
  if (!tenant.threecx_host || !tenant.ssh_user || !tenant.ssh_password) {
    logger.debug(`Tenant ${tenant.slug} missing SSH credentials - file sync disabled`, {
      tenantId: tenant.id
    });
    return null;
  }

  return {
    host: tenant.threecx_host,
    port: tenant.ssh_port || 22,
    username: tenant.ssh_user,
    password: tenant.ssh_password,
  };
}

export async function testTenantConnection(tenant: TenantConfig): Promise<boolean> {
  const pool = await getTenantPool(tenant);
  if (!pool) {
    return false;
  }

  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    logger.info(`Tenant ${tenant.slug} database connection successful (via SSH tunnel)`, { tenantId: tenant.id });
    return true;
  } catch (error) {
    const err = error as Error;
    logger.error(`Tenant ${tenant.slug} database connection failed`, {
      tenantId: tenant.id,
      host: tenant.threecx_host,
      error: err.message,
    });
    return false;
  }
}

export async function closeTenantPool(tenantId: string): Promise<void> {
  const pool = tenantPools.get(tenantId);
  if (pool) {
    await pool.end();
    tenantPools.delete(tenantId);
    logger.info(`Closed database pool for tenant`, { tenantId });
  }
  // Also close the SSH tunnel
  await closeTunnel(tenantId);
}

export async function closeAllTenantPools(): Promise<void> {
  for (const [tenantId, pool] of tenantPools) {
    try {
      await pool.end();
      logger.info(`Closed database pool for tenant`, { tenantId });
    } catch (error) {
      logger.error(`Error closing pool for tenant`, { tenantId, error: (error as Error).message });
    }
  }
  tenantPools.clear();

  // Close all SSH tunnels
  await closeAllSshTunnels();
}
