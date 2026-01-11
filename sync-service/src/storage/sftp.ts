import SftpClient from "ssh2-sftp-client";
import { logger } from "../utils/logger";

export interface SftpConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

export async function createSftpClient(config: SftpConfig): Promise<SftpClient> {
  const sftp = new SftpClient();

  try {
    await sftp.connect({
      host: config.host,
      port: config.port || 22,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey,
      readyTimeout: 10000,
      retries: 2,
      retry_minTimeout: 2000,
    });

    logger.debug("SFTP connection established", { host: config.host });
    return sftp;
  } catch (error) {
    logger.error("SFTP connection failed", {
      host: config.host,
      error: (error as Error).message,
    });
    throw error;
  }
}

export async function listRemoteFiles(
  sftp: SftpClient,
  remotePath: string
): Promise<string[]> {
  try {
    const exists = await sftp.exists(remotePath);
    if (!exists) {
      logger.warn("Remote directory does not exist", { path: remotePath });
      return [];
    }

    const listing = await sftp.list(remotePath);
    return listing
      .filter((item) => item.type === "-") // Only files, not directories
      .map((item) => item.name);
  } catch (error) {
    logger.error("Failed to list remote directory", {
      path: remotePath,
      error: (error as Error).message,
    });
    return [];
  }
}

// Recursively list all files including subdirectories
export async function listRemoteFilesRecursive(
  sftp: SftpClient,
  remotePath: string,
  basePath?: string
): Promise<Array<{ filename: string; relativePath: string; fullPath: string }>> {
  const results: Array<{ filename: string; relativePath: string; fullPath: string }> = [];
  const currentBase = basePath || remotePath;

  try {
    const exists = await sftp.exists(remotePath);
    if (!exists) {
      logger.warn("Remote directory does not exist", { path: remotePath });
      return results;
    }

    const listing = await sftp.list(remotePath);

    for (const item of listing) {
      const itemPath = `${remotePath}/${item.name}`;

      if (item.type === "d") {
        // It's a directory - recurse into it
        const subFiles = await listRemoteFilesRecursive(sftp, itemPath, currentBase);
        results.push(...subFiles);
      } else if (item.type === "-") {
        // It's a file
        const relativePath = itemPath.replace(currentBase + "/", "");
        results.push({
          filename: item.name,
          relativePath,
          fullPath: itemPath,
        });
      }
    }

    return results;
  } catch (error) {
    logger.error("Failed to list remote directory recursively", {
      path: remotePath,
      error: (error as Error).message,
    });
    return results;
  }
}

export async function downloadFile(
  sftp: SftpClient,
  remotePath: string
): Promise<Buffer> {
  try {
    const buffer = await sftp.get(remotePath);
    if (Buffer.isBuffer(buffer)) {
      return buffer;
    }
    // Handle stream case
    throw new Error("Unexpected stream response from SFTP get");
  } catch (error) {
    logger.error("Failed to download file via SFTP", {
      path: remotePath,
      error: (error as Error).message,
    });
    throw error;
  }
}

export async function closeSftpClient(sftp: SftpClient): Promise<void> {
  try {
    await sftp.end();
    logger.debug("SFTP connection closed");
  } catch (error) {
    logger.warn("Error closing SFTP connection", {
      error: (error as Error).message,
    });
  }
}
