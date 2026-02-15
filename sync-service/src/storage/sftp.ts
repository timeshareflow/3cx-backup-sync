import SftpClient from "ssh2-sftp-client";
import { Readable } from "stream";
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

// File info with size for smart downloading
export interface RemoteFileInfo {
  filename: string;
  relativePath: string;
  fullPath: string;
  size: number; // bytes
}

// Max file size for in-memory download (25MB)
// Files larger than this should be streamed or skipped
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

// Recursively list all files including subdirectories with size info
export async function listRemoteFilesRecursive(
  sftp: SftpClient,
  remotePath: string,
  basePath?: string
): Promise<RemoteFileInfo[]> {
  const results: RemoteFileInfo[] = [];
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
        // It's a file - include size
        const relativePath = itemPath.replace(currentBase + "/", "");
        results.push({
          filename: item.name,
          relativePath,
          fullPath: itemPath,
          size: item.size,
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

// Get file size without downloading
export async function getRemoteFileSize(
  sftp: SftpClient,
  remotePath: string
): Promise<number> {
  try {
    const stat = await sftp.stat(remotePath);
    return stat.size;
  } catch (error) {
    logger.error("Failed to get file size", {
      path: remotePath,
      error: (error as Error).message,
    });
    return -1;
  }
}

// Timeout wrapper for async operations
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

export async function downloadFile(
  sftp: SftpClient,
  remotePath: string,
  timeoutMs: number = 120000 // 2 minute default timeout per file
): Promise<Buffer> {
  try {
    const buffer = await withTimeout(
      sftp.get(remotePath),
      timeoutMs,
      `Download ${remotePath}`
    );
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

/**
 * Stream a file from SFTP - returns a readable stream for piping to S3
 * Use this for large files to avoid loading them entirely into memory
 */
export async function downloadFileStream(
  sftp: SftpClient,
  remotePath: string
): Promise<Readable> {
  try {
    // ssh2-sftp-client returns a readable stream when no destination is specified
    const stream = sftp.createReadStream(remotePath, {
      autoClose: true,
    });

    logger.debug("Created SFTP read stream", { path: remotePath });
    return stream as unknown as Readable;
  } catch (error) {
    logger.error("Failed to create SFTP read stream", {
      path: remotePath,
      error: (error as Error).message,
    });
    throw error;
  }
}

/**
 * Higher limit for streaming uploads (500MB)
 * Streaming doesn't load the entire file into memory
 */
export const MAX_STREAM_FILE_SIZE_BYTES = 500 * 1024 * 1024;
