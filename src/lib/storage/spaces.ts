import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as s3GetSignedUrl } from "@aws-sdk/s3-request-presigner";

const SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT || "nyc3.digitaloceanspaces.com";
const SPACES_REGION = process.env.DO_SPACES_REGION || "nyc3";
const SPACES_BUCKET = process.env.DO_SPACES_BUCKET || "3cxbackupwiz";
const SPACES_KEY = process.env.DO_SPACES_KEY || "";
const SPACES_SECRET = process.env.DO_SPACES_SECRET || "";

let s3Client: S3Client | null = null;

function getSpacesClient(): S3Client {
  if (!s3Client) {
    if (!SPACES_KEY || !SPACES_SECRET) {
      throw new Error("DO Spaces credentials not configured");
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
  }

  return s3Client;
}

export async function getSignedUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const client = getSpacesClient();
  const command = new GetObjectCommand({ Bucket: SPACES_BUCKET, Key: storagePath });
  return s3GetSignedUrl(client, command, { expiresIn });
}

export async function uploadBuffer(
  buffer: Buffer,
  storagePath: string,
  contentType: string,
  isPublic = false
): Promise<string> {
  const client = getSpacesClient();
  await client.send(new PutObjectCommand({
    Bucket: SPACES_BUCKET,
    Key: storagePath,
    Body: buffer,
    ContentType: contentType,
    ACL: isPublic ? "public-read" : "private",
  }));
  return storagePath;
}

export async function deleteFile(storagePath: string): Promise<void> {
  const client = getSpacesClient();
  await client.send(new DeleteObjectCommand({ Bucket: SPACES_BUCKET, Key: storagePath }));
}

export function getPublicUrl(storagePath: string): string {
  return `https://${SPACES_BUCKET}.${SPACES_ENDPOINT}/${storagePath}`;
}

export function isSpacesConfigured(): boolean {
  return !!(SPACES_KEY && SPACES_SECRET && SPACES_BUCKET);
}
