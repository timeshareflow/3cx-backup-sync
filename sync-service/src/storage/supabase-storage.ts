import { getSupabaseClient } from "./supabase";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";
import {
  compressMedia,
  CompressionResult,
  CompressionSettings,
  DEFAULT_COMPRESSION_SETTINGS,
} from "../utils/compression";

const BUCKET_NAME = "backupwiz-files";

// File type detection utilities
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
 * Sanitize a filename for Supabase Storage.
 * Supabase Storage doesn't allow certain characters like brackets.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    // Replace brackets with parentheses
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    // Replace other problematic characters with underscores
    .replace(/[#%&{}\\<>*?/$!'":@+`|=]/g, "_")
    // Collapse multiple underscores
    .replace(/_+/g, "_")
    // Remove leading/trailing underscores
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

  // Sanitize the filename to remove problematic characters
  const sanitizedBaseName = sanitizeFilename(baseName);

  return `${tenantId}/${category}/${year}/${month}/${sanitizedBaseName}.${ext}`;
}

// Check if file exists in Supabase Storage
export async function fileExists(storagePath: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(path.dirname(storagePath), {
        search: path.basename(storagePath),
      });

    if (error) {
      return false;
    }

    return data.some(file => file.name === path.basename(storagePath));
  } catch {
    return false;
  }
}

// Upload file from local path to Supabase Storage
export async function uploadFile(
  localPath: string,
  storagePath: string,
  contentType: string
): Promise<{ path: string; size: number }> {
  const supabase = getSupabaseClient();
  const fileContent = fs.readFileSync(localPath);
  const stat = fs.statSync(localPath);

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, fileContent, {
      contentType,
      upsert: false,
    });

  if (error) {
    // Check if it's a duplicate error
    if (error.message?.includes("already exists") || error.message?.includes("Duplicate")) {
      logger.debug(`File already exists, skipping: ${storagePath}`);
      return { path: storagePath, size: stat.size };
    }
    throw new Error(`Failed to upload file to Supabase Storage: ${error.message}`);
  }

  logger.debug(`Uploaded file to Supabase Storage: ${storagePath}`);
  return { path: data.path, size: stat.size };
}

// Upload buffer to Supabase Storage
export async function uploadBuffer(
  buffer: Buffer,
  storagePath: string,
  contentType: string
): Promise<{ path: string; size: number }> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    if (error.message?.includes("already exists") || error.message?.includes("Duplicate")) {
      logger.debug(`File already exists, skipping: ${storagePath}`);
      return { path: storagePath, size: buffer.length };
    }
    throw new Error(`Failed to upload buffer to Supabase Storage: ${error.message}`);
  }

  logger.debug(`Uploaded buffer to Supabase Storage: ${storagePath}`);
  return { path: data.path, size: buffer.length };
}

// Get signed URL for file download
export async function getSignedUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    throw new Error(`Failed to get signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

// Delete file from Supabase Storage
export async function deleteFile(storagePath: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([storagePath]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }

  logger.debug(`Deleted file from Supabase Storage: ${storagePath}`);
}

// Get public URL for file (if bucket is public)
export function getPublicUrl(storagePath: string): string {
  const supabase = getSupabaseClient();
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
  return data.publicUrl;
}

// Alias for uploadBuffer for clarity in SFTP contexts
export const uploadFileBuffer = uploadBuffer;

/**
 * Upload buffer with automatic compression based on file type
 * Returns the compressed result including new extension/mime type
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
    // Replace extension in storage path
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
    logger.info("Uploaded compressed media", {
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
