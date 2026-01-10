import { GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client, S3_BUCKET, S3_ARCHIVE_PREFIX } from "./client";

export async function getPresignedUrl(
  s3Key: string,
  expiresIn: number = 3600
): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key,
  });

  return getSignedUrl(client, command, { expiresIn });
}

export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string
): Promise<string> {
  const client = getS3Client();
  const fullKey = `${S3_ARCHIVE_PREFIX}${key}`;

  await client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: fullKey,
      Body: body,
      ContentType: contentType,
    })
  );

  return fullKey;
}

export async function checkFileExists(s3Key: string): Promise<boolean> {
  const client = getS3Client();

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function getFileTypeFromMime(mimeType: string): "image" | "video" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
}

export function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return mimeTypes[ext || ""] || "application/octet-stream";
}
