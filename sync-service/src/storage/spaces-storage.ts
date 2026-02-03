import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl as s3GetSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import * as path from "path";
import * as fs from "fs";
import { Readable } from "stream";
import { logger } from "../utils/logger";
import {
  compressMedia,
  CompressionSettings,
  DEFAULT_COMPRESSION_SETTINGS,
} from "../utils/compression";

// DO Spaces configuration from environment
const SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT || "nyc3.digitaloceanspaces.com";
const SPACES_REGION = process.env.DO_SPACES_REGION || "nyc3";
const SPACES_BUCKET = process.env.DO_SPACES_BUCKET || "3cxbackupwiz";
const SPACES_KEY = process.env.DO_SPACES_KEY || "";
const SPACES_SECRET = process.env.DO_SPACES_SECRET || "";

// Create S3 client for DO Spaces
let s3Client: S3Client | null = null;

export function getSpacesClient(): S3Client {
  if (!s3Client) {
    if (!SPACES_KEY || !SPACES_SECRET) {
      throw new Error("DO Spaces credentials not configured. Set DO_SPACES_KEY and DO_SPACES_SECRET environment variables.");
    }

    s3Client = new S3Client({
      endpoint: `https://${SPACES_ENDPOINT}`,
      region: SPACES_REGION,
      credentials: {
        accessKeyId: SPACES_KEY,
        secretAccessKey: SPACES_SECRET,
      },
      forcePathStyle: false,
    });

    logger.info("DO Spaces client initialized", {
      endpoint: SPACES_ENDPOINT,
      bucket: SPACES_BUCKET,
      region: SPACES_REGION,
    });
  }

  return s3Client;
}

// File type detection utilities (same as supabase-storage)
const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic"];
const videoExts = ["mp4", "mov", "avi", "webm", "mkv", "m4v"];
const audioExts = ["wav", "mp3", "ogg", "m4a", "wma", "aac"];

const mimeTypes: Record<string, string> = {
  // Images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  heic: "image/heic",
  // Video
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  webm: "video/webm",
  mkv: "video/x-matroska",
  m4v: "video/x-m4v",
  // Audio
  wav: "audio/wav",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  wma: "audio/x-ms-wma",
  aac: "audio/aac",
  // Documents
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  tiff: "image/tiff",
  tif: "image/tiff",
};

export type FileCategory = "chat-media" | "recordings" | "voicemails" | "faxes" | "meetings";

/**
 * Sanitize a filename for storage.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .replace(/[#%&{}\\<>*?/$!'":@+`|=]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export interface FileTypeInfo {
  fileType: "image" | "video" | "audio" | "document";
  mimeType: string;
  extension: string;
}

// Get file type info from filename
export function getFileInfo(filename: string): FileTypeInfo {
  const ext = path.extname(filename).toLowerCase().slice(1);

  let fileType: FileTypeInfo["fileType"] = "document";
  if (imageExts.includes(ext)) fileType = "image";
  else if (videoExts.includes(ext)) fileType = "video";
  else if (audioExts.includes(ext)) fileType = "audio";

  return {
    fileType,
    mimeType: mimeTypes[ext] || "application/octet-stream",
    extension: ext || "bin",
  };
}

// Detect file type from buffer magic bytes
export function detectFileType(buffer: Buffer): FileTypeInfo {
  const header = buffer.slice(0, 12);

  // JPEG
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return { fileType: "image", mimeType: "image/jpeg", extension: "jpg" };
  }

  // PNG
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) {
    return { fileType: "image", mimeType: "image/png", extension: "png" };
  }

  // GIF
  if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) {
    return { fileType: "image", mimeType: "image/gif", extension: "gif" };
  }

  // MP4/MOV (ftyp)
  if (header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70) {
    return { fileType: "video", mimeType: "video/mp4", extension: "mp4" };
  }

  // WAV (RIFF....WAVE)
  if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
      header[8] === 0x57 && header[9] === 0x41 && header[10] === 0x56 && header[11] === 0x45) {
    return { fileType: "audio", mimeType: "audio/wav", extension: "wav" };
  }

  // MP3 (ID3 or sync bytes)
  if ((header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) ||
      (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)) {
    return { fileType: "audio", mimeType: "audio/mpeg", extension: "mp3" };
  }

  // PDF
  if (header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46) {
    return { fileType: "document", mimeType: "application/pdf", extension: "pdf" };
  }

  // TIFF
  if ((header[0] === 0x49 && header[1] === 0x49 && header[2] === 0x2a && header[3] === 0x00) ||
      (header[0] === 0x4d && header[1] === 0x4d && header[2] === 0x00 && header[3] === 0x2a)) {
    return { fileType: "document", mimeType: "image/tiff", extension: "tiff" };
  }

  return { fileType: "document", mimeType: "application/octet-stream", extension: "bin" };
}

// Generate storage path for a file
export function generateStoragePath(
  tenantId: string,
  category: FileCategory,
  filename: string,
  extension?: string
): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const ext = extension || path.extname(filename).slice(1) || "bin";
  const baseName = path.basename(filename, path.extname(filename));
  const sanitizedBaseName = sanitizeFilename(baseName);

  return `${tenantId}/${category}/${year}/${month}/${sanitizedBaseName}.${ext}`;
}

// Check if file exists in DO Spaces
export async function fileExists(storagePath: string): Promise<boolean> {
  try {
    const client = getSpacesClient();
    await client.send(new HeadObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: storagePath,
    }));
    return true;
  } catch (error: unknown) {
    if ((error as { name?: string }).name === "NotFound") {
      return false;
    }
    // For other errors, assume file doesn't exist
    return false;
  }
}

// Upload buffer to DO Spaces
export async function uploadBuffer(
  buffer: Buffer,
  storagePath: string,
  contentType: string
): Promise<{ path: string; size: number }> {
  const client = getSpacesClient();

  try {
    await client.send(new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: storagePath,
      Body: buffer,
      ContentType: contentType,
      ACL: "private",
    }));

    logger.debug(`Uploaded buffer to DO Spaces: ${storagePath}`);
    return { path: storagePath, size: buffer.length };
  } catch (error) {
    throw new Error(`Failed to upload buffer to DO Spaces: ${(error as Error).message}`);
  }
}

// Upload file from local path to DO Spaces
export async function uploadFile(
  localPath: string,
  storagePath: string,
  contentType: string
): Promise<{ path: string; size: number }> {
  const client = getSpacesClient();
  const fileContent = fs.readFileSync(localPath);
  const stat = fs.statSync(localPath);

  try {
    await client.send(new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: storagePath,
      Body: fileContent,
      ContentType: contentType,
      ACL: "private",
    }));

    logger.debug(`Uploaded file to DO Spaces: ${storagePath}`);
    return { path: storagePath, size: stat.size };
  } catch (error) {
    throw new Error(`Failed to upload file to DO Spaces: ${(error as Error).message}`);
  }
}

// Stream upload to DO Spaces (for large files)
export async function streamUpload(
  stream: Readable,
  storagePath: string,
  contentType: string,
  fileSize?: number
): Promise<{ path: string; size: number }> {
  const client = getSpacesClient();

  const upload = new Upload({
    client,
    params: {
      Bucket: SPACES_BUCKET,
      Key: storagePath,
      Body: stream,
      ContentType: contentType,
      ACL: "private",
    },
    // Part size for multipart upload (5MB minimum)
    partSize: 5 * 1024 * 1024,
    // Max concurrent uploads
    queueSize: 4,
  });

  upload.on("httpUploadProgress", (progress) => {
    if (progress.loaded && progress.total) {
      const percent = Math.round((progress.loaded / progress.total) * 100);
      logger.debug(`Upload progress: ${percent}%`, { path: storagePath });
    }
  });

  await upload.done();

  logger.debug(`Stream uploaded to DO Spaces: ${storagePath}`);
  return { path: storagePath, size: fileSize || 0 };
}

// Get signed URL for file download
export async function getSignedUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const client = getSpacesClient();

  const command = new GetObjectCommand({
    Bucket: SPACES_BUCKET,
    Key: storagePath,
  });

  const signedUrl = await s3GetSignedUrl(client, command, { expiresIn });
  return signedUrl;
}

// Download file from DO Spaces
export async function downloadFile(storagePath: string): Promise<Buffer> {
  const client = getSpacesClient();

  const response = await client.send(new GetObjectCommand({
    Bucket: SPACES_BUCKET,
    Key: storagePath,
  }));

  if (!response.Body) {
    throw new Error(`Empty response body for: ${storagePath}`);
  }

  // Convert stream to buffer
  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

// Delete file from DO Spaces
export async function deleteFile(storagePath: string): Promise<void> {
  const client = getSpacesClient();

  await client.send(new DeleteObjectCommand({
    Bucket: SPACES_BUCKET,
    Key: storagePath,
  }));

  logger.debug(`Deleted file from DO Spaces: ${storagePath}`);
}

// List files in a directory
export async function listFiles(prefix: string): Promise<string[]> {
  const client = getSpacesClient();
  const files: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: SPACES_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key) {
          files.push(obj.Key);
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return files;
}

// Alias for uploadBuffer
export const uploadFileBuffer = uploadBuffer;

/**
 * Upload buffer with automatic compression based on file type
 */
export async function uploadBufferWithCompression(
  buffer: Buffer,
  storagePath: string,
  fileType: "image" | "video" | "audio" | "document",
  originalExtension: string,
  compressionSettings: CompressionSettings = DEFAULT_COMPRESSION_SETTINGS
): Promise<{
  path: string;
  size: number;
  originalSize: number;
  compressionRatio: number;
  wasCompressed: boolean;
  newExtension: string;
  newMimeType: string;
}> {
  // Compress the media
  const compressionResult = await compressMedia(
    buffer,
    fileType,
    originalExtension,
    compressionSettings
  );

  // Update storage path with new extension if compressed
  let finalStoragePath = storagePath;
  if (compressionResult.wasCompressed && compressionResult.newExtension !== originalExtension) {
    const pathWithoutExt = storagePath.replace(/\.[^.]+$/, "");
    finalStoragePath = `${pathWithoutExt}.${compressionResult.newExtension}`;
  }

  // Upload the (possibly compressed) buffer
  const uploadResult = await uploadBuffer(
    compressionResult.buffer,
    finalStoragePath,
    compressionResult.newMimeType
  );

  if (compressionResult.wasCompressed) {
    logger.info("Uploaded compressed media to DO Spaces", {
      originalSize: `${(compressionResult.originalSize / 1024).toFixed(1)}KB`,
      compressedSize: `${(compressionResult.compressedSize / 1024).toFixed(1)}KB`,
      savings: `${compressionResult.compressionRatio.toFixed(1)}%`,
      path: finalStoragePath,
    });
  }

  return {
    path: uploadResult.path,
    size: compressionResult.compressedSize,
    originalSize: compressionResult.originalSize,
    compressionRatio: compressionResult.compressionRatio,
    wasCompressed: compressionResult.wasCompressed,
    newExtension: compressionResult.newExtension,
    newMimeType: compressionResult.newMimeType,
  };
}

// Check if DO Spaces is configured
export function isSpacesConfigured(): boolean {
  return !!(SPACES_KEY && SPACES_SECRET && SPACES_BUCKET);
}

// Get bucket name (for migration scripts)
export function getBucketName(): string {
  return SPACES_BUCKET;
}
