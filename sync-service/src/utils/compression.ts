import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { logger } from "./logger";

// Compression settings
export interface CompressionSettings {
  // Image settings
  imageMaxDimension: number; // Max width or height
  imageQuality: number; // JPEG/WebP quality (1-100)
  imageFormat: "jpeg" | "webp" | "png"; // Output format

  // Audio settings
  audioBitrate: string; // e.g., "128k"
  audioFormat: "mp3" | "aac"; // Output format

  // Video settings
  videoBitrate: string; // e.g., "1000k"
  videoMaxHeight: number; // Max video height (e.g., 720 for 720p)
  videoFormat: "mp4"; // Output format
  videoCodec: string; // e.g., "libx264"
  audioCodecForVideo: string; // e.g., "aac"

  // General
  enabled: boolean;
}

// Default compression settings optimized for storage savings
export const DEFAULT_COMPRESSION_SETTINGS: CompressionSettings = {
  // Images: Resize large images and compress
  imageMaxDimension: 1920, // Full HD max
  imageQuality: 80, // Good quality with decent compression
  imageFormat: "webp", // WebP offers best compression

  // Audio: Convert to MP3 (good for voice recordings)
  audioBitrate: "128k", // Good quality for voice
  audioFormat: "mp3",

  // Video: Compress to 720p MP4
  videoBitrate: "1500k", // Reasonable quality
  videoMaxHeight: 720, // 720p max
  videoFormat: "mp4",
  videoCodec: "libx264",
  audioCodecForVideo: "aac",

  enabled: true,
};

export interface CompressionResult {
  buffer: Buffer;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  newMimeType: string;
  newExtension: string;
  wasCompressed: boolean;
}

/**
 * Compress an image buffer
 */
export async function compressImage(
  buffer: Buffer,
  settings: CompressionSettings = DEFAULT_COMPRESSION_SETTINGS
): Promise<CompressionResult> {
  const originalSize = buffer.length;

  try {
    let sharpInstance = sharp(buffer);

    // Get metadata to check dimensions
    const metadata = await sharpInstance.metadata();

    // Resize if larger than max dimension
    if (
      metadata.width &&
      metadata.height &&
      (metadata.width > settings.imageMaxDimension ||
        metadata.height > settings.imageMaxDimension)
    ) {
      sharpInstance = sharpInstance.resize(settings.imageMaxDimension, settings.imageMaxDimension, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // Convert to target format with quality setting
    let outputBuffer: Buffer;
    let mimeType: string;
    let extension: string;

    switch (settings.imageFormat) {
      case "webp":
        outputBuffer = await sharpInstance.webp({ quality: settings.imageQuality }).toBuffer();
        mimeType = "image/webp";
        extension = "webp";
        break;
      case "jpeg":
        outputBuffer = await sharpInstance.jpeg({ quality: settings.imageQuality }).toBuffer();
        mimeType = "image/jpeg";
        extension = "jpg";
        break;
      case "png":
        outputBuffer = await sharpInstance.png({ compressionLevel: 9 }).toBuffer();
        mimeType = "image/png";
        extension = "png";
        break;
      default:
        outputBuffer = await sharpInstance.webp({ quality: settings.imageQuality }).toBuffer();
        mimeType = "image/webp";
        extension = "webp";
    }

    const compressionRatio = originalSize > 0 ? (1 - outputBuffer.length / originalSize) * 100 : 0;

    logger.debug("Image compressed", {
      originalSize,
      compressedSize: outputBuffer.length,
      compressionRatio: `${compressionRatio.toFixed(1)}%`,
      originalDimensions: `${metadata.width}x${metadata.height}`,
    });

    return {
      buffer: outputBuffer,
      originalSize,
      compressedSize: outputBuffer.length,
      compressionRatio,
      newMimeType: mimeType,
      newExtension: extension,
      wasCompressed: true,
    };
  } catch (error) {
    logger.error("Failed to compress image, using original", { error });
    return {
      buffer,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0,
      newMimeType: "image/jpeg", // Assume original format
      newExtension: "jpg",
      wasCompressed: false,
    };
  }
}

/**
 * Compress an audio buffer (WAV to MP3/AAC)
 */
export async function compressAudio(
  buffer: Buffer,
  originalExtension: string,
  settings: CompressionSettings = DEFAULT_COMPRESSION_SETTINGS
): Promise<CompressionResult> {
  const originalSize = buffer.length;

  // Skip if already in compressed format
  if (["mp3", "aac", "m4a", "ogg"].includes(originalExtension.toLowerCase())) {
    return {
      buffer,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0,
      newMimeType: originalExtension === "mp3" ? "audio/mpeg" : `audio/${originalExtension}`,
      newExtension: originalExtension,
      wasCompressed: false,
    };
  }

  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `input_${Date.now()}.${originalExtension}`);
  const outputPath = path.join(tempDir, `output_${Date.now()}.${settings.audioFormat}`);

  try {
    // Write buffer to temp file
    fs.writeFileSync(inputPath, buffer);

    // Compress using ffmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioBitrate(settings.audioBitrate)
        .audioCodec(settings.audioFormat === "mp3" ? "libmp3lame" : "aac")
        .format(settings.audioFormat)
        .on("error", (err: Error) => reject(err))
        .on("end", () => resolve())
        .save(outputPath);
    });

    // Read compressed file
    const compressedBuffer = fs.readFileSync(outputPath);
    const compressionRatio =
      originalSize > 0 ? (1 - compressedBuffer.length / originalSize) * 100 : 0;

    logger.debug("Audio compressed", {
      originalSize,
      compressedSize: compressedBuffer.length,
      compressionRatio: `${compressionRatio.toFixed(1)}%`,
      format: `${originalExtension} -> ${settings.audioFormat}`,
    });

    return {
      buffer: compressedBuffer,
      originalSize,
      compressedSize: compressedBuffer.length,
      compressionRatio,
      newMimeType: settings.audioFormat === "mp3" ? "audio/mpeg" : "audio/aac",
      newExtension: settings.audioFormat,
      wasCompressed: true,
    };
  } catch (error) {
    logger.error("Failed to compress audio, using original", { error });
    return {
      buffer,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0,
      newMimeType: `audio/${originalExtension}`,
      newExtension: originalExtension,
      wasCompressed: false,
    };
  } finally {
    // Cleanup temp files
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Compress a video buffer
 */
export async function compressVideo(
  buffer: Buffer,
  originalExtension: string,
  settings: CompressionSettings = DEFAULT_COMPRESSION_SETTINGS
): Promise<CompressionResult> {
  const originalSize = buffer.length;

  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `input_${Date.now()}.${originalExtension}`);
  const outputPath = path.join(tempDir, `output_${Date.now()}.${settings.videoFormat}`);

  try {
    // Write buffer to temp file
    fs.writeFileSync(inputPath, buffer);

    // Get video metadata first
    const metadata = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const videoStream = metadata.streams.find((s) => s.codec_type === "video");
    const currentHeight = videoStream?.height || 0;
    const currentWidth = videoStream?.width || 0;

    // Calculate target resolution maintaining aspect ratio
    let targetHeight = Math.min(currentHeight, settings.videoMaxHeight);
    let targetWidth = Math.round((targetHeight / currentHeight) * currentWidth);

    // Ensure dimensions are even (required by most codecs)
    targetHeight = Math.floor(targetHeight / 2) * 2;
    targetWidth = Math.floor(targetWidth / 2) * 2;

    // Skip compression if already small enough and in MP4 format
    if (
      currentHeight <= settings.videoMaxHeight &&
      originalExtension.toLowerCase() === "mp4" &&
      originalSize < 50 * 1024 * 1024 // Less than 50MB
    ) {
      logger.debug("Video already optimized, skipping compression", {
        height: currentHeight,
        size: originalSize,
      });
      return {
        buffer,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 0,
        newMimeType: "video/mp4",
        newExtension: "mp4",
        wasCompressed: false,
      };
    }

    // Compress using ffmpeg
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .videoCodec(settings.videoCodec)
        .videoBitrate(settings.videoBitrate)
        .audioCodec(settings.audioCodecForVideo)
        .audioBitrate("128k")
        .format(settings.videoFormat)
        .outputOptions([
          "-preset medium", // Balance between speed and compression
          "-crf 23", // Constant Rate Factor for quality
          "-movflags +faststart", // Enable streaming
        ]);

      // Only resize if needed
      if (currentHeight > settings.videoMaxHeight) {
        command = command.size(`${targetWidth}x${targetHeight}`);
      }

      command.on("error", (err: Error) => reject(err)).on("end", () => resolve()).save(outputPath);
    });

    // Read compressed file
    const compressedBuffer = fs.readFileSync(outputPath);
    const compressionRatio =
      originalSize > 0 ? (1 - compressedBuffer.length / originalSize) * 100 : 0;

    logger.info("Video compressed", {
      originalSize: `${(originalSize / 1024 / 1024).toFixed(2)}MB`,
      compressedSize: `${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB`,
      compressionRatio: `${compressionRatio.toFixed(1)}%`,
      resolution: `${currentWidth}x${currentHeight} -> ${targetWidth}x${targetHeight}`,
    });

    return {
      buffer: compressedBuffer,
      originalSize,
      compressedSize: compressedBuffer.length,
      compressionRatio,
      newMimeType: "video/mp4",
      newExtension: "mp4",
      wasCompressed: true,
    };
  } catch (error) {
    logger.error("Failed to compress video, using original", {
      error: error instanceof Error ? error.message : error,
    });
    return {
      buffer,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0,
      newMimeType: `video/${originalExtension}`,
      newExtension: originalExtension,
      wasCompressed: false,
    };
  } finally {
    // Cleanup temp files
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Compress media based on type
 */
export async function compressMedia(
  buffer: Buffer,
  fileType: "image" | "video" | "audio" | "document",
  originalExtension: string,
  settings: CompressionSettings = DEFAULT_COMPRESSION_SETTINGS
): Promise<CompressionResult> {
  if (!settings.enabled) {
    return {
      buffer,
      originalSize: buffer.length,
      compressedSize: buffer.length,
      compressionRatio: 0,
      newMimeType: `${fileType}/${originalExtension}`,
      newExtension: originalExtension,
      wasCompressed: false,
    };
  }

  switch (fileType) {
    case "image":
      return compressImage(buffer, settings);
    case "audio":
      return compressAudio(buffer, originalExtension, settings);
    case "video":
      return compressVideo(buffer, originalExtension, settings);
    default:
      // Documents are not compressed
      return {
        buffer,
        originalSize: buffer.length,
        compressedSize: buffer.length,
        compressionRatio: 0,
        newMimeType: `application/${originalExtension}`,
        newExtension: originalExtension,
        wasCompressed: false,
      };
  }
}

/**
 * Check if ffmpeg is available
 */
export async function checkFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.getAvailableFormats((err: Error | null) => {
      if (err) {
        logger.warn("FFmpeg not available - audio/video compression disabled", {
          error: err.message,
        });
        resolve(false);
      } else {
        logger.info("FFmpeg available for audio/video compression");
        resolve(true);
      }
    });
  });
}
