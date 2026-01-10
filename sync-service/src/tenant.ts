import { Pool } from "pg";
import { getSupabaseClient } from "./storage/supabase";
import { logger } from "./utils/logger";

export interface TenantConfig {
  id: string;
  name: string;
  slug: string;
  threecx_host: string | null;
  threecx_port: number | null;
  threecx_database: string | null;
  threecx_user: string | null;
  threecx_password: string | null;
  is_active: boolean;
}

// Cache for tenant database pools
const tenantPools: Map<string, Pool> = new Map();

export async function getActiveTenants(): Promise<TenantConfig[]> {
  const supabase = getSupabaseClient();

  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("is_active", true)
    .not("threecx_host", "is", null);

  if (error) {
    logger.error("Failed to fetch active tenants", { error: error.message });
    throw new Error(`Failed to fetch tenants: ${error.message}`);
  }

  return tenants || [];
}

export function getTenantPool(tenant: TenantConfig): Pool | null {
  if (!tenant.threecx_host || !tenant.threecx_password) {
    logger.warn(`Tenant ${tenant.slug} missing 3CX credentials`, { tenantId: tenant.id });
    return null;
  }

  // Check if we already have a pool for this tenant
  if (tenantPools.has(tenant.id)) {
    return tenantPools.get(tenant.id)!;
  }

  // Create new pool for this tenant
  const pool = new Pool({
    host: tenant.threecx_host,
    port: tenant.threecx_port || 5432,
    database: tenant.threecx_database || "database_single",
    user: tenant.threecx_user || "phonesystem",
    password: tenant.threecx_password,
    max: 3, // Fewer connections per tenant
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on("error", (err) => {
    logger.error(`Tenant ${tenant.slug} database pool error`, {
      tenantId: tenant.id,
      error: err.message,
    });
  });

  tenantPools.set(tenant.id, pool);

  logger.info(`Created database pool for tenant ${tenant.slug}`, {
    tenantId: tenant.id,
    host: tenant.threecx_host,
    port: tenant.threecx_port,
  });

  return pool;
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
    logger.info(`Tenant ${tenant.slug} database connection successful`, { tenantId: tenant.id });
    return true;
  } catch (error) {
    const err = error as Error;
    logger.error(`Tenant ${tenant.slug} database connection failed`, {
      tenantId: tenant.id,
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

// Legacy support - get pool for single-tenant mode using environment variables
export function getLegacyPool(): Pool | undefined {
  const host = process.env.THREECX_DB_HOST;
  const password = process.env.THREECX_DB_PASSWORD;

  if (!host || !password) {
    return undefined;
  }

  return new Pool({
    host,
    port: parseInt(process.env.THREECX_DB_PORT || "5432"),
    database: process.env.THREECX_DB_NAME || "database_single",
    user: process.env.THREECX_DB_USER || "phonesystem",
    password,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}
