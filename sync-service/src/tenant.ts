import { Pool } from "pg";
import { getSupabaseClient } from "./storage/supabase";
import { logger } from "./utils/logger";
import { SftpConfig } from "./storage/sftp";
import { createSshTunnel, closeTunnel, closeAllTunnels as closeAllSshTunnels } from "./ssh-tunnel";

// Raw tenant data from database (includes both old and new columns)
interface RawTenantData {
  id: string;
  name: string;
  slug: string;
  threecx_host: string | null;
  // New SSH columns (primary)
  ssh_port: number | null;
  ssh_user: string | null;
  ssh_password: string | null;
  threecx_db_password: string | null;
  // Legacy columns (fallback) - NEVER REMOVE THESE
  sftp_port: number | null;
  sftp_user: string | null;
  sftp_password: string | null;
  threecx_password: string | null;
  // File paths
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

// Normalized tenant config (after applying fallback logic)
export interface TenantConfig {
  id: string;
  name: string;
  slug: string;
  threecx_host: string | null;
  ssh_port: number | null;
  ssh_user: string | null;
  ssh_password: string | null;
  threecx_db_password: string | null;
  threecx_chat_files_path: string | null;
  threecx_recordings_path: string | null;
  threecx_voicemail_path: string | null;
  threecx_fax_path: string | null;
  threecx_meetings_path: string | null;
  backup_chats: boolean;
  backup_chat_media: boolean;
  backup_recordings: boolean;
  backup_voicemails: boolean;
  backup_faxes: boolean;
  backup_cdr: boolean;
  backup_meetings: boolean;
  is_active: boolean;
  sync_enabled: boolean;
  has_active_users?: boolean;
  last_user_activity_at?: string | null;
}

// Normalize tenant data: use new columns, fall back to legacy columns
function normalizeTenant(raw: RawTenantData): TenantConfig {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    threecx_host: raw.threecx_host,
    // Use new columns with fallback to legacy columns
    ssh_port: raw.ssh_port ?? raw.sftp_port ?? 22,
    ssh_user: raw.ssh_user || raw.sftp_user,
    ssh_password: raw.ssh_password || raw.sftp_password,
    threecx_db_password: raw.threecx_db_password || raw.threecx_password,
    // File paths
    threecx_chat_files_path: raw.threecx_chat_files_path,
    threecx_recordings_path: raw.threecx_recordings_path,
    threecx_voicemail_path: raw.threecx_voicemail_path,
    threecx_fax_path: raw.threecx_fax_path,
    threecx_meetings_path: raw.threecx_meetings_path,
    // Backup settings
    backup_chats: raw.backup_chats,
    backup_chat_media: raw.backup_chat_media,
    backup_recordings: raw.backup_recordings,
    backup_voicemails: raw.backup_voicemails,
    backup_faxes: raw.backup_faxes,
    backup_cdr: raw.backup_cdr,
    backup_meetings: raw.backup_meetings,
    // Status
    is_active: raw.is_active,
    sync_enabled: raw.sync_enabled,
  };
}

// Cache for tenant database pools
const tenantPools: Map<string, Pool> = new Map();

// Active user threshold - 5 minutes
const ACTIVE_USER_THRESHOLD_MS = 5 * 60 * 1000;

export async function getActiveTenants(): Promise<TenantConfig[]> {
  const supabase = getSupabaseClient();

  // Fetch BOTH old and new columns - backward compatible
  const { data: tenants, error } = await supabase
    .from("tenants")
    .select(`
      id, name, slug,
      threecx_host,
      ssh_port, ssh_user, ssh_password, threecx_db_password,
      sftp_port, sftp_user, sftp_password, threecx_password,
      threecx_chat_files_path, threecx_recordings_path, threecx_voicemail_path, threecx_fax_path, threecx_meetings_path,
      backup_chats, backup_chat_media, backup_recordings, backup_voicemails, backup_faxes, backup_cdr, backup_meetings,
      is_active, sync_enabled, last_user_activity_at
    `)
    .eq("is_active", true)
    .eq("sync_enabled", true)
    .not("threecx_host", "is", null);

  if (error) {
    logger.error("Failed to fetch active tenants", { error: error.message });
    throw new Error(`Failed to fetch tenants: ${error.message}`);
  }

  const now = Date.now();

  // Normalize each tenant (apply fallback logic) and add activity status
  return (tenants || []).map((raw) => {
    const tenant = normalizeTenant(raw as RawTenantData);
    const lastActivity = raw.last_user_activity_at
      ? new Date(raw.last_user_activity_at).getTime()
      : 0;
    const hasActiveUsers = now - lastActivity < ACTIVE_USER_THRESHOLD_MS;

    return {
      ...tenant,
      has_active_users: hasActiveUsers,
      last_user_activity_at: raw.last_user_activity_at,
    };
  });
}

// Get tenants that need immediate sync (have active users)
export async function getActiveUserTenants(): Promise<TenantConfig[]> {
  const tenants = await getActiveTenants();
  return tenants.filter((t) => t.has_active_users);
}

// Get tenants that need background sync (no active users)
export async function getInactiveTenants(): Promise<TenantConfig[]> {
  const tenants = await getActiveTenants();
  return tenants.filter((t) => !t.has_active_users);
}

export async function getTenantPool(tenant: TenantConfig): Promise<Pool | null> {
  if (!tenant.threecx_host || !tenant.ssh_user || !tenant.ssh_password || !tenant.threecx_db_password) {
    logger.warn(`Tenant ${tenant.slug} missing connection credentials`, {
      tenantId: tenant.id,
      hasHost: !!tenant.threecx_host,
      hasSshUser: !!tenant.ssh_user,
      hasSshPassword: !!tenant.ssh_password,
      hasDbPassword: !!tenant.threecx_db_password,
    });
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
