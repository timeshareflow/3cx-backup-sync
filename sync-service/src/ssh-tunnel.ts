import { Client, ConnectConfig } from "ssh2";
import * as net from "net";
import * as dns from "dns";
import { promisify } from "util";
import { logger } from "./utils/logger";

const dnsLookup = promisify(dns.lookup);

export interface SshTunnelConfig {
  sshHost: string;
  sshPort: number;
  sshUsername: string;
  sshPassword: string;
  remoteHost: string;  // Usually 127.0.0.1 (PostgreSQL on the remote server)
  remotePort: number;  // Usually 5432 (PostgreSQL port)
}

// Connection retry configuration
const SSH_CONFIG = {
  maxRetries: 3,
  retryDelayMs: 5000,
  readyTimeout: 60000,  // 60 seconds (increased from 30)
  keepaliveInterval: 10000,
  keepaliveCountMax: 5,
};

export interface SshTunnel {
  localPort: number;
  sshClient: Client;
  server: net.Server;
  close: () => Promise<void>;
}

// Track active tunnels per tenant
const activeTunnels: Map<string, SshTunnel> = new Map();

// Callback for when a tunnel dies - allows tenant.ts to clean up stale pools
let onTunnelDiedCallback: ((tenantId: string) => void) | null = null;

export function setOnTunnelDiedCallback(callback: (tenantId: string) => void): void {
  onTunnelDiedCallback = callback;
}

// Find an available local port
function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address !== "string") {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error("Could not get available port"));
      }
    });
    server.on("error", reject);
  });
}

// Test if a host is reachable via DNS
async function testDnsResolution(host: string): Promise<{ resolved: boolean; ip?: string; error?: string }> {
  try {
    const result = await dnsLookup(host);
    return { resolved: true, ip: result.address };
  } catch (error) {
    return { resolved: false, error: (error as Error).message };
  }
}

// Test basic TCP connectivity
async function testTcpConnection(host: string, port: number, timeoutMs: number = 10000): Promise<{ connected: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ connected: false, error: `TCP connection timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    socket.on("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve({ connected: true });
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      socket.destroy();
      resolve({ connected: false, error: err.message });
    });

    socket.connect(port, host);
  });
}

// Attempt a single SSH connection
async function attemptSshConnection(
  config: SshTunnelConfig,
  localPort: number,
  tenantId: string
): Promise<SshTunnel> {
  return new Promise((resolve, reject) => {
    const sshClient = new Client();

    const sshConfig: ConnectConfig = {
      host: config.sshHost,
      port: config.sshPort,
      username: config.sshUsername,
      password: config.sshPassword,
      readyTimeout: SSH_CONFIG.readyTimeout,
      keepaliveInterval: SSH_CONFIG.keepaliveInterval,
      keepaliveCountMax: SSH_CONFIG.keepaliveCountMax,
    };

    // Create local TCP server that forwards to remote via SSH
    const server = net.createServer((socket) => {
      sshClient.forwardOut(
        "127.0.0.1",
        localPort,
        config.remoteHost,
        config.remotePort,
        (err, stream) => {
          if (err) {
            logger.error(`SSH tunnel forward error`, { tenantId, error: err.message });
            socket.end();
            return;
          }
          socket.pipe(stream).pipe(socket);
        }
      );
    });

    const connectionTimeout = setTimeout(() => {
      sshClient.end();
      server.close();
      reject(new Error(`SSH connection timed out after ${SSH_CONFIG.readyTimeout}ms`));
    }, SSH_CONFIG.readyTimeout + 5000);

    sshClient.on("ready", () => {
      clearTimeout(connectionTimeout);
      logger.info(`SSH connection established for tenant`, { tenantId });

      server.listen(localPort, "127.0.0.1", () => {
        logger.info(`SSH tunnel listening`, { tenantId, localPort });

        const tunnel: SshTunnel = {
          localPort,
          sshClient,
          server,
          close: async () => {
            return new Promise((res) => {
              server.close(() => {
                sshClient.end();
                activeTunnels.delete(tenantId);
                logger.info(`SSH tunnel closed for tenant`, { tenantId });
                res();
              });
            });
          },
        };

        activeTunnels.set(tenantId, tunnel);
        resolve(tunnel);
      });
    });

    sshClient.on("error", (err) => {
      clearTimeout(connectionTimeout);
      logger.error(`SSH connection error for tenant`, { tenantId, error: err.message });
      server.close();
      activeTunnels.delete(tenantId);
      // Notify that tunnel died so pool can be cleaned up
      if (onTunnelDiedCallback) {
        onTunnelDiedCallback(tenantId);
      }
      reject(err);
    });

    sshClient.on("close", () => {
      logger.warn(`SSH connection closed for tenant`, { tenantId });
      activeTunnels.delete(tenantId);
      // Notify that tunnel died so pool can be cleaned up
      if (onTunnelDiedCallback) {
        onTunnelDiedCallback(tenantId);
      }
    });

    sshClient.connect(sshConfig);
  });
}

export async function createSshTunnel(
  tenantId: string,
  config: SshTunnelConfig
): Promise<SshTunnel> {
  // Return existing tunnel if already established
  const existing = activeTunnels.get(tenantId);
  if (existing) {
    logger.debug(`Using existing SSH tunnel for tenant`, { tenantId });
    return existing;
  }

  logger.info(`Creating SSH tunnel for tenant`, {
    tenantId,
    sshHost: config.sshHost,
    sshPort: config.sshPort,
    remotePort: config.remotePort,
  });

  // Step 1: Test DNS resolution
  const dnsResult = await testDnsResolution(config.sshHost);
  if (!dnsResult.resolved) {
    const error = `DNS resolution failed for ${config.sshHost}: ${dnsResult.error}`;
    logger.error(error, { tenantId });
    throw new Error(error);
  }
  logger.info(`DNS resolved ${config.sshHost} to ${dnsResult.ip}`, { tenantId });

  // Step 2: Test TCP connectivity
  const tcpResult = await testTcpConnection(config.sshHost, config.sshPort, 15000);
  if (!tcpResult.connected) {
    const error = `Cannot reach ${config.sshHost}:${config.sshPort} - ${tcpResult.error}. Check firewall settings on the 3CX server.`;
    logger.error(error, { tenantId });
    throw new Error(error);
  }
  logger.info(`TCP connection to ${config.sshHost}:${config.sshPort} successful`, { tenantId });

  // Step 3: Attempt SSH connection with retries
  const localPort = await getAvailablePort();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= SSH_CONFIG.maxRetries; attempt++) {
    try {
      logger.info(`SSH connection attempt ${attempt}/${SSH_CONFIG.maxRetries}`, {
        tenantId,
        sshHost: config.sshHost,
      });

      const tunnel = await attemptSshConnection(config, localPort, tenantId);
      return tunnel;
    } catch (error) {
      lastError = error as Error;
      logger.warn(`SSH connection attempt ${attempt} failed`, {
        tenantId,
        error: lastError.message,
        retriesLeft: SSH_CONFIG.maxRetries - attempt,
      });

      if (attempt < SSH_CONFIG.maxRetries) {
        await new Promise((res) => setTimeout(res, SSH_CONFIG.retryDelayMs));
      }
    }
  }

  const finalError = `SSH connection failed after ${SSH_CONFIG.maxRetries} attempts: ${lastError?.message}`;
  logger.error(finalError, { tenantId, sshHost: config.sshHost });
  throw new Error(finalError);
}

export function getExistingTunnel(tenantId: string): SshTunnel | undefined {
  return activeTunnels.get(tenantId);
}

export async function closeTunnel(tenantId: string): Promise<void> {
  const tunnel = activeTunnels.get(tenantId);
  if (tunnel) {
    await tunnel.close();
  }
}

export async function closeAllTunnels(): Promise<void> {
  for (const [tenantId, tunnel] of activeTunnels) {
    try {
      await tunnel.close();
    } catch (error) {
      logger.error(`Error closing tunnel for tenant`, { tenantId, error: (error as Error).message });
    }
  }
  activeTunnels.clear();
}
