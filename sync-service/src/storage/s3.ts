import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";
import { S3Error } from "../utils/errors";

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    logger.info("S3 client initialized", { region: process.env.AWS_REGION });
  }
  return s3Client;
}

const S3_BUCKET = process.env.S3_BUCKET_NAME!;
const S3_PREFIX = process.env.S3_ARCHIVE_PREFIX || "chat-archive/";

// Check if file already exists in S3
export async function fileExists(key: string): Promise<boolean> {
  try {
    const client = getS3Client();
    await client.send(
      new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      })
    );
    return true;
  } catch (error) {
    return false;
  }
}

// Upload file to S3
export async function uploadFile(
  localPath: string,
  s3Key: string,
  contentType: string
): Promise<string> {
  try {
    const client = getS3Client();
    const fileContent = fs.readFileSync(localPath);
    const fullKey = `${S3_PREFIX}${s3Key}`;

    await client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: fullKey,
        Body: fileContent,
        ContentType: contentType,
      })
    );

    logger.debug(`Uploaded file to S3`, { key: fullKey });
    return fullKey;
  } catch (error) {
    const err = error as Error;
    throw new S3Error(`Failed to upload file to S3: ${err.message}`, {
      localPath,
      s3Key,
    });
  }
}

// Upload buffer to S3
export async function uploadBuffer(
  buffer: Buffer,
  s3Key: string,
  contentType: string
): Promise<string> {
  try {
    const client = getS3Client();
    const fullKey = `${S3_PREFIX}${s3Key}`;

    await client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: fullKey,
        Body: buffer,
        ContentType: contentType,
      })
    );

    logger.debug(`Uploaded buffer to S3`, { key: fullKey });
    return fullKey;
  } catch (error) {
    const err = error as Error;
    throw new S3Error(`Failed to upload buffer to S3: ${err.message}`, {
      s3Key,
    });
  }
}

// Get file type and mime type from filename
export function getFileInfo(filename: string): {
  fileType: "image" | "video" | "document";
  mimeType: string;
} {
  const ext = path.extname(filename).toLowerCase().slice(1);

  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic"];
  const videoExts = ["mp4", "mov", "avi", "webm", "mkv", "m4v"];

  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    heic: "image/heic",
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    webm: "video/webm",
    mkv: "video/x-matroska",
    m4v: "video/x-m4v",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };

  let fileType: "image" | "video" | "document" = "document";
  if (imageExts.includes(ext)) fileType = "image";
  else if (videoExts.includes(ext)) fileType = "video";

  return {
    fileType,
    mimeType: mimeTypes[ext] || "application/octet-stream",
  };
}

// Detect file type from buffer (for files without extensions)
export function detectFileType(buffer: Buffer): {
  fileType: "image" | "video" | "document";
  mimeType: string;
  extension: string;
} {
  // Check magic bytes
  const header = buffer.slice(0, 12);

  // JPEG
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return { fileType: "image", mimeType: "image/jpeg", extension: "jpg" };
  }

  // PNG
  if (
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  ) {
    return { fileType: "image", mimeType: "image/png", extension: "png" };
  }

  // GIF
  if (
    header[0] === 0x47 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x38
  ) {
    return { fileType: "image", mimeType: "image/gif", extension: "gif" };
  }

  // MP4/MOV (ftyp)
  if (
    header[4] === 0x66 &&
    header[5] === 0x74 &&
    header[6] === 0x79 &&
    header[7] === 0x70
  ) {
    return { fileType: "video", mimeType: "video/mp4", extension: "mp4" };
  }

  // PDF
  if (
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46
  ) {
    return { fileType: "document", mimeType: "application/pdf", extension: "pdf" };
  }

  // Default
  return {
    fileType: "document",
    mimeType: "application/octet-stream",
    extension: "bin",
  };
}
