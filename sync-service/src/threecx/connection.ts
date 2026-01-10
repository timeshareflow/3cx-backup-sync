import { Pool, PoolClient } from "pg";
import { logger } from "../utils/logger";
import { DatabaseConnectionError } from "../utils/errors";

let pool: Pool | null = null;

export function getThreeCXPool(): Pool {
  if (!pool) {
    const config = {
      host: process.env.THREECX_DB_HOST || "127.0.0.1",
      port: parseInt(process.env.THREECX_DB_PORT || "5480"),
      database: process.env.THREECX_DB_NAME || "database_single",
      user: process.env.THREECX_DB_USER || "phonesystem",
      password: process.env.THREECX_DB_PASSWORD,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

    logger.info("Creating 3CX database pool", {
      host: config.host,
      port: config.port,
      database: config.database,
    });

    pool = new Pool(config);

    pool.on("error", (err) => {
      logger.error("3CX database pool error", { error: err.message });
    });
  }

  return pool;
}

export async function testConnection(): Promise<boolean> {
  try {
    const pool = getThreeCXPool();
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    logger.info("3CX database connection successful");
    return true;
  } catch (error) {
    const err = error as Error;
    logger.error("3CX database connection failed", { error: err.message });
    throw new DatabaseConnectionError("Failed to connect to 3CX database", {
      error: err.message,
    });
  }
}

export async function closeConnection(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info("3CX database connection closed");
  }
}

export async function withClient<T>(
  callback: (client: PoolClient) => Promise<T>,
  customPool?: Pool
): Promise<T> {
  const targetPool = customPool || getThreeCXPool();
  const client = await targetPool.connect();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}
