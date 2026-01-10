import { Pool } from "pg";
import { getSupabaseClient } from "./storage/supabase";
import { logger } from "./utils/logger";
import { SftpConfig } from "./storage/sftp";

export interface TenantConfig {
  id: string;
  name: string;
  slug: string;
  // PostgreSQL connection (remote)
  threecx_host: string | null;
  threecx_port: number | null;
  threecx_database: string | null;
  threecx_user: string | null;
  threecx_password: string | null;
  // SFTP for file access (remote)
  sftp_host: string | null;
  sftp_port: number | null;
  sftp_user: string | null;
  sftp_password: string | null;
  // File paths on 3CX server
  threecx_chat_files_path: string | null;
  threecx_recordings_path: string | null;
  threecx_voicemail_path: string | null;
  threecx_fax_path: string | null;
  // Backup settings
  backup_chats: boolean;
  backup_chat_media: boolean;
  backup_recordings: boolean;
  backup_voicemails: boolean;
  backup_faxes: boolean;
  backup_cdr: boolean;
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
      threecx_host, threecx_port, threecx_database, threecx_user, threecx_password,
      sftp_host, sftp_port, sftp_user, sftp_password,
      threecx_chat_files_path, threecx_recordings_path, threecx_voicemail_path, threecx_fax_path,
      backup_chats, backup_chat_media, backup_recordings, backup_voicemails, backup_faxes, backup_cdr,
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

export function getTenantPool(tenant: TenantConfig): Pool | null {
  if (!tenant.threecx_host || !tenant.threecx_password) {
    logger.warn(`Tenant ${tenant.slug} missing 3CX database credentials`, { tenantId: tenant.id });
    return null;
  }

  // Check if we already have a pool for this tenant
  if (tenantPools.has(tenant.id)) {
    return tenantPools.get(tenant.id)!;
  }

  // Create new pool for this tenant - connects REMOTELY to their 3CX server
  const pool = new Pool({
    host: tenant.threecx_host,
    port: tenant.threecx_port || 5432,
    database: tenant.threecx_database || "database_single",
    user: tenant.threecx_user || "phonesystem",
    password: tenant.threecx_password,
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000, // Longer timeout for remote connections
    ssl: false, // 3CX typically doesn't use SSL for PostgreSQL
  });

  pool.on("error", (err) => {
    logger.error(`Tenant ${tenant.slug} database pool error`, {
      tenantId: tenant.id,
      error: err.message,
    });
  });

  tenantPools.set(tenant.id, pool);

  logger.info(`Created remote database pool for tenant ${tenant.slug}`, {
    tenantId: tenant.id,
    host: tenant.threecx_host,
    port: tenant.threecx_port || 5432,
  });

  return pool;
}

export function getTenantSftpConfig(tenant: TenantConfig): SftpConfig | null {
  // SFTP host defaults to same as database host if not specified
  const sftpHost = tenant.sftp_host || tenant.threecx_host;

  if (!sftpHost || !tenant.sftp_user || !tenant.sftp_password) {
    logger.debug(`Tenant ${tenant.slug} missing SFTP credentials - file sync disabled`, {
      tenantId: tenant.id
    });
    return null;
  }

  return {
    host: sftpHost,
    port: tenant.sftp_port || 22,
    username: tenant.sftp_user,
    password: tenant.sftp_password,
  };
}

export async function testTenantConnection(tenant: TenantConfig): Promise<boolean> {
  const pool = getTenantPool(tenant);
  if (!pool) {
    return false;
  }

  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    logger.info(`Tenant ${tenant.slug} remote database connection successful`, { tenantId: tenant.id });
    return true;
  } catch (error) {
    const err = error as Error;
    logger.error(`Tenant ${tenant.slug} remote database connection failed`, {
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
}
