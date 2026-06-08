import * as path from "path";
import { logger } from "../utils/logger";
import { getMessageById, getConversations } from "../threecx/queries";
import type { RealtimeMessagePayload } from "../threecx/realtime-listener";
import {
  getConversationId,
  upsertConversation,
  upsertParticipant,
  updateConversationNameFromParticipants,
  insertMessage,
  linkMediaToMessage,
  insertMediaFileNew,
} from "../storage/supabase";
import {
  uploadBufferWithCompression,
  generateStoragePath,
  detectFileType,
} from "../storage/spaces-storage";
import {
  createSftpClient,
  downloadFile,
  closeSftpClient,
  MAX_FILE_SIZE_BYTES,
} from "../storage/sftp";
import { getTenantSftpConfig, TenantConfig } from "../tenant";
import { DEFAULT_COMPRESSION_SETTINGS } from "../utils/compression";

// Known 3CX chat file paths — same as media.ts
const CHAT_FILE_PATHS = [
  "/var/lib/3cxpbx/Instance1/Data/Chat",
  "/var/lib/3cxpbx/Instance1/Data/Http/Files/Chat Files",
  "/var/lib/3cxpbx/Data/Http/Files/Chat Files",
  "/var/lib/3cxpbx/Data/Chat",
  "/home/phonesystem/.3CXPhone System/Data/Http/Files/Chat Files",
];

function mapProviderToChannel(providerType: string | null): string {
  if (!providerType) return "internal";
  const t = providerType.toLowerCase();
  if (t.includes("sms")) return "sms";
  if (t.includes("mms")) return "mms";
  if (t.includes("facebook") || t.includes("fb")) return "facebook";
  if (t.includes("whatsapp")) return "whatsapp";
  if (t.includes("livechat") || t.includes("webchat")) return "livechat";
  if (t.includes("telegram")) return "telegram";
  if (t.includes("teams")) return "teams";
  return t || "internal";
}

function parseParticipants(raw: string | null): Array<{ extension: string; name: string }> {
  if (!raw) return [];
  try {
    if (raw.startsWith("[")) return JSON.parse(raw);
    return raw.split(",").map((p) => {
      const parts = p.trim().split(":");
      return { extension: parts[0] || "", name: parts[1] || parts[0] || "" };
    });
  } catch {
    return [];
  }
}

function detectMediaType(message: string | null): { hasMedia: boolean; messageType: string } {
  if (!message) return { hasMedia: false, messageType: "text" };
  const s = message.trim();
  const imageP = [/\[image\]/i, /\.jpe?g$/i, /\.png$/i, /\.gif$/i, /\.webp$/i, /\.heic$/i];
  const videoP = [/\[video\]/i, /\.mp4$/i, /\.mov$/i, /\.avi$/i, /\.webm$/i, /\.3gp$/i];
  const fileP  = [/\[file\]/i, /\[document\]/i, /\.pdf$/i, /\.doc$/i, /\.docx$/i];
  for (const p of imageP) if (p.test(s)) return { hasMedia: true, messageType: "image" };
  for (const p of videoP) if (p.test(s)) return { hasMedia: true, messageType: "video" };
  for (const p of fileP)  if (p.test(s)) return { hasMedia: true, messageType: "file" };
  return { hasMedia: false, messageType: "text" };
}

// Download a single chat media file from the 3CX server via SFTP,
// compress it, upload to DO Spaces, and record in media_files.
// Tries each known path until the file is found. Never throws.
async function syncSingleMediaFile(
  tenant: TenantConfig,
  internalFileName: string,
  publicFileName: string | null,
  tenantId: string
): Promise<void> {
  const sftpConfig = getTenantSftpConfig(tenant);
  if (!sftpConfig) return;

  let sftp;
  try {
    sftp = await createSftpClient(sftpConfig);

    for (const basePath of CHAT_FILE_PATHS) {
      const filePath = `${basePath}/${internalFileName}`;
      let buffer: Buffer;

      try {
        buffer = await downloadFile(sftp, filePath, 30_000); // 30s timeout per attempt
      } catch {
        continue; // File not at this path — try next
      }

      if (!buffer || buffer.length === 0) continue;

      if (buffer.length > MAX_FILE_SIZE_BYTES) {
        logger.warn("Realtime: media file too large for immediate sync — periodic sync will handle it", {
          tenantId, internalFileName, size: buffer.length,
        });
        return;
      }

      const detected = detectFileType(buffer);
      const displayName = publicFileName || internalFileName;
      const storagePath = generateStoragePath(tenantId, "chat-media", displayName, detected.extension);

      const uploadResult = await uploadBufferWithCompression(
        buffer,
        storagePath,
        detected.fileType,
        detected.extension,
        DEFAULT_COMPRESSION_SETTINGS
      );

      await insertMediaFileNew({
        tenant_id: tenantId,
        original_filename: displayName,
        stored_filename: path.basename(uploadResult.path),
        file_type: detected.fileType,
        mime_type: uploadResult.newMimeType,
        file_size: uploadResult.size,
        storage_path: uploadResult.path,
        storage_backend: "spaces",
      });

      logger.info("Realtime: media file synced immediately", {
        tenantId,
        filename: displayName,
        size: uploadResult.size,
        compressed: uploadResult.wasCompressed,
        savings: uploadResult.wasCompressed
          ? `${uploadResult.compressionRatio.toFixed(1)}%`
          : "n/a",
      });
      return;
    }

    logger.warn("Realtime: media file not found at any known path — periodic sync will retry", {
      tenantId, internalFileName,
    });
  } catch (err) {
    logger.warn("Realtime: media file sync error — periodic sync will retry", {
      tenantId, internalFileName, error: (err as Error).message,
    });
  } finally {
    if (sftp) {
      await closeSftpClient(sftp).catch(() => {});
    }
  }
}

// Handle a single realtime notification from the 3CX LISTEN channel.
// Never throws — any error is logged and the polling fallback will catch missed messages.
export async function syncRealtimeMessage(
  payload: RealtimeMessagePayload,
  tenant: TenantConfig
): Promise<void> {
  const tenantId = tenant.id;

  try {
    // Fetch the full message from 3CX views by its integer PK
    const msg = await getMessageById(payload.id_message);

    if (!msg) {
      // Views may have a small propagation lag for the very first instant.
      // The polling cycle will catch this message on its next run.
      logger.debug("Realtime: message not yet in views — polling will sync it", {
        tenantId,
        id_message: payload.id_message,
      });
      return;
    }

    // Ensure the conversation exists in Supabase
    let convId = await getConversationId(msg.conversation_id, tenantId);

    if (!convId) {
      const convs = await getConversations([msg.conversation_id]);
      const convMeta = convs[0] ?? null;
      convId = await upsertConversation({
        threecx_conversation_id: msg.conversation_id,
        conversation_name: convMeta?.chat_name ?? null,
        channel_type: mapProviderToChannel(convMeta?.provider_type ?? null),
        is_external: msg.is_external,
        is_group_chat: parseParticipants(convMeta?.participants_grp_array ?? null).length > 2,
        tenant_id: tenantId,
      });
    }

    // Add sender as participant
    if (convId && msg.sender_participant_no) {
      await upsertParticipant({
        conversation_id: convId,
        extension_number: msg.sender_participant_no,
        display_name: msg.sender_participant_name ?? null,
        participant_type: msg.is_external ? "external" : "extension",
        tenant_id: tenantId,
      });
      await updateConversationNameFromParticipants(convId);
    }

    const { hasMedia, messageType } = detectMediaType(msg.message);

    // insertMessage uses ON CONFLICT DO NOTHING — safe to call multiple times for same message
    const messageId = await insertMessage({
      conversation_id: convId,
      threecx_message_id: msg.message_id,
      sender_extension: msg.sender_participant_no ?? null,
      sender_name: msg.sender_participant_name ?? null,
      message_text: msg.message,
      message_type: messageType,
      has_media: hasMedia || payload.has_media,
      sent_at: msg.time_sent.toISOString(),
      tenant_id: tenantId,
    });

    if (!messageId) {
      // insertMessage returned null — message already existed (polling beat us to it)
      logger.debug("Realtime: message already synced by polling — skipping", {
        tenantId,
        id_message: payload.id_message,
      });
      return;
    }

    logger.info("Realtime: message synced", {
      tenantId,
      id_message: payload.id_message,
      has_media: payload.has_media,
    });

    // Handle media attachment
    if (payload.has_media && payload.internal_file_name && convId) {
      // Assign narrowed locals so TypeScript sees string (not string | null)
      const internalFile: string = payload.internal_file_name;
      const publicFile: string = payload.public_file_name || "";
      const safeConvId: string = convId;

      let fileInfo: { Width?: number; Height?: number; Size?: number } | null = null;
      if (payload.file_info) {
        try { fileInfo = JSON.parse(payload.file_info); } catch { /* ignore */ }
      }

      // Link the file to the message — we already have the hash→filename mapping from the trigger
      await linkMediaToMessage(
        tenantId,
        internalFile,
        messageId,
        publicFile,
        safeConvId,
        fileInfo
      );

      // Immediately download + compress + upload the specific file (fire-and-forget)
      // If this fails, the periodic media sync will pick it up on its next cycle
      if (tenant.backup_chat_media) {
        syncSingleMediaFile(
          tenant,
          internalFile,
          payload.public_file_name,
          tenantId
        ).catch((err) => {
          logger.warn("Realtime: immediate media file sync failed — periodic sync will retry", {
            tenantId,
            internal_file_name: internalFile,
            error: (err as Error).message,
          });
        });
      }
    }
  } catch (err) {
    // Never rethrow — polling is the safety net for any missed messages
    logger.error("Realtime: message sync error (polling will catch any missed messages)", {
      tenantId,
      id_message: payload.id_message,
      error: (err as Error).message,
    });
  }
}
