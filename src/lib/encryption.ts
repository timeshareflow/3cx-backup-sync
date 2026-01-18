import crypto from "crypto";

/**
 * Secure encryption utilities for sensitive data.
 *
 * IMPORTANT: The ENCRYPTION_KEY environment variable MUST be set in production.
 * It should be at least 32 characters long and stored securely.
 *
 * Generate a secure key with: openssl rand -base64 32
 */

let _encryptionKey: string | null = null;

/**
 * Get the encryption key, validating it exists and meets minimum requirements.
 * Throws an error if the key is not set or too short.
 */
export function getEncryptionKey(): string {
  if (_encryptionKey) {
    return _encryptionKey;
  }

  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required. " +
      "Generate one with: openssl rand -base64 32"
    );
  }

  if (key.length < 32) {
    throw new Error(
      "ENCRYPTION_KEY must be at least 32 characters long for security. " +
      "Generate one with: openssl rand -base64 32"
    );
  }

  _encryptionKey = key;
  return _encryptionKey;
}

/**
 * Encrypt sensitive text using AES-256-CBC.
 * Returns format: iv:encryptedData (hex encoded)
 */
export function encrypt(text: string): string {
  const algorithm = "aes-256-cbc";
  const key = crypto.scryptSync(getEncryptionKey(), "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

/**
 * Decrypt text that was encrypted with the encrypt() function.
 * Returns empty string if decryption fails (invalid data or wrong key).
 */
export function decrypt(encryptedText: string): string {
  try {
    const algorithm = "aes-256-cbc";
    const key = crypto.scryptSync(getEncryptionKey(), "salt", 32);
    const [ivHex, encrypted] = encryptedText.split(":");

    if (!ivHex || !encrypted) {
      return "";
    }

    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return "";
  }
}

/**
 * Check if encryption is properly configured.
 * Use this to verify setup without throwing errors.
 */
export function isEncryptionConfigured(): boolean {
  const key = process.env.ENCRYPTION_KEY;
  return !!key && key.length >= 32;
}
