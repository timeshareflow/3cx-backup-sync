import { Client, ConnectConfig } from "ssh2";
import * as net from "net";
import { logger } from "./utils/logger";

export interface SshTunnelConfig {
  sshHost: string;
  sshPort: number;
  sshUsername: string;
  sshPassword: string;
  remoteHost: string;  // Usually 127.0.0.1 (PostgreSQL on the remote server)
  remotePort: number;  // Usually 5432 (PostgreSQL port)
}

export interface SshTunnel {
  localPort: number;
  sshClient: Client;
  server: net.Server;
  close: () => Promise<void>;
}

// Track active tunnels per tenant
const activeTunnels: Map<string, SshTunnel> = new Map();

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
    remotePort: config.remotePort,
  });

  return new Promise(async (resolve, reject) => {
    const localPort = await getAvailablePort();
    const sshClient = new Client();

    const sshConfig: ConnectConfig = {
      host: config.sshHost,
      port: config.sshPort,
      username: config.sshUsername,
      password: config.sshPassword,
      readyTimeout: 30000,
      keepaliveInterval: 10000,
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

    sshClient.on("ready", () => {
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
      logger.error(`SSH connection error for tenant`, { tenantId, error: err.message });
      server.close();
      reject(err);
    });

    sshClient.on("close", () => {
      logger.warn(`SSH connection closed for tenant`, { tenantId });
      activeTunnels.delete(tenantId);
    });

    sshClient.connect(sshConfig);
  });
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
