import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as s3GetSignedUrl } from "@aws-sdk/s3-request-presigner";

// DO Spaces configuration from environment
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

/**
 * Get a signed URL for downloading a file from DO Spaces
 * @param storagePath - The path to the file in the bucket
 * @param expiresIn - URL expiration time in seconds (default: 1 hour)
 */
export async function getSignedUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const client = getSpacesClient();

  const command = new GetObjectCommand({
    Bucket: SPACES_BUCKET,
    Key: storagePath,
  });

  return s3GetSignedUrl(client, command, { expiresIn });
}

/**
 * Check if DO Spaces is configured
 */
export function isSpacesConfigured(): boolean {
  return !!(SPACES_KEY && SPACES_SECRET && SPACES_BUCKET);
}

/**
 * Get the public CDN URL for a file (if CDN is enabled)
 * Note: Only use this for public files
 */
export function getCdnUrl(storagePath: string): string {
  return `https://${SPACES_BUCKET}.${SPACES_ENDPOINT}/${storagePath}`;
}
