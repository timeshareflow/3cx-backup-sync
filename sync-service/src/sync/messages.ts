import { Pool } from "pg";
import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import {
  getNewMessages,
  getConversations,
  ThreeCXMessage,
} from "../threecx/queries";
import {
  upsertConversation,
  upsertParticipant,
  insertMessage,
  getConversationId,
  updateSyncStatus,
  getLastSyncedTimestamp,
} from "../storage/supabase";

export interface MessageSyncResult {
  messagesSynced: number;
  conversationsCreated: number;
  errors: Array<{ messageId: string; error: string }>;
}

// Parse participant array from 3CX format
function parseParticipants(
  participantsArray: string | null
): Array<{ extension: string; name: string }> {
  if (!participantsArray) return [];

  try {
    // Format varies, could be JSON array or comma-separated
    if (participantsArray.startsWith("[")) {
      return JSON.parse(participantsArray);
    }

    // Try comma-separated format: "ext1:name1,ext2:name2"
    return participantsArray.split(",").map((p) => {
      const parts = p.trim().split(":");
      return {
        extension: parts[0] || "",
        name: parts[1] || parts[0] || "",
      };
    });
  } catch {
    logger.warn("Failed to parse participants array", { participantsArray });
    return [];
  }
}

// Detect if message contains media reference
function detectMediaInMessage(message: string | null): {
  hasMedia: boolean;
  messageType: string;
} {
  if (!message) return { hasMedia: false, messageType: "text" };

  // 3CX often indicates media with specific patterns
  const imagePatterns = [/\[image\]/i, /\.jpg$/i, /\.png$/i, /\.gif$/i];
  const videoPatterns = [/\[video\]/i, /\.mp4$/i, /\.mov$/i];
  const filePatterns = [/\[file\]/i, /\[document\]/i];

  for (const pattern of imagePatterns) {
    if (pattern.test(message)) {
      return { hasMedia: true, messageType: "image" };
    }
  }

  for (const pattern of videoPatterns) {
    if (pattern.test(message)) {
      return { hasMedia: true, messageType: "video" };
    }
  }

  for (const pattern of filePatterns) {
    if (pattern.test(message)) {
      return { hasMedia: true, messageType: "file" };
    }
  }

  return { hasMedia: false, messageType: "text" };
}

export async function syncMessages(
  batchSize: number = 100,
  pool?: Pool,
  tenantId?: string
): Promise<MessageSyncResult> {
  const result: MessageSyncResult = {
    messagesSynced: 0,
    conversationsCreated: 0,
    errors: [],
  };

  try {
    await updateSyncStatus("messages", "running", { tenantId });

    // Get last synced timestamp
    const lastSynced = await getLastSyncedTimestamp("messages", tenantId);
    logger.info("Starting message sync", {
      tenantId,
      lastSynced: lastSynced?.toISOString() || "never",
    });

    // Fetch new messages from 3CX
    const messages = await getNewMessages(lastSynced, batchSize, pool);

    if (messages.length === 0) {
      logger.info("No new messages to sync", { tenantId });
      await updateSyncStatus("messages", "success", { recordsSynced: 0, tenantId });
      return result;
    }

    logger.info(`Processing ${messages.length} messages`, { tenantId });

    // Group messages by conversation
    const conversationIds = [...new Set(messages.map((m) => m.conversation_id))];

    // Fetch conversation metadata for any new conversations
    const conversations = await getConversations(conversationIds, pool);
    const conversationMap = new Map(
      conversations.map((c) => [c.conversation_id, c])
    );

    // Process each message
    let lastTimestamp: string | null = null;

    for (const msg of messages) {
      try {
        // Ensure conversation exists
        let supabaseConversationId = await getConversationId(msg.conversation_id, tenantId);

        if (!supabaseConversationId) {
          const convMeta = conversationMap.get(msg.conversation_id);

          // Create conversation
          supabaseConversationId = await upsertConversation({
            threecx_conversation_id: msg.conversation_id,
            conversation_name: convMeta?.chat_name || null,
            is_external: msg.is_external,
            is_group_chat:
              parseParticipants(convMeta?.participants_grp_array || null)
                .length > 2,
            tenant_id: tenantId,
          });

          result.conversationsCreated++;

          // Add participants
          if (convMeta) {
            const participants = parseParticipants(
              convMeta.participants_grp_array
            );

            for (const p of participants) {
              await upsertParticipant({
                conversation_id: supabaseConversationId,
                extension_number: p.extension,
                display_name: p.name,
                participant_type: msg.is_external ? "external" : "extension",
              });
            }

            // Also add the sender as participant if not in array
            if (msg.sender_participant_no) {
              await upsertParticipant({
                conversation_id: supabaseConversationId,
                extension_number: msg.sender_participant_no,
                display_name: msg.sender_participant_name || null,
                participant_type: msg.is_external ? "external" : "extension",
              });
            }
          }
        }

        // Detect media
        const { hasMedia, messageType } = detectMediaInMessage(msg.message);

        // Insert message
        const messageId = await insertMessage({
          conversation_id: supabaseConversationId,
          threecx_message_id: msg.message_id,
          sender_extension: msg.sender_participant_no || null,
          sender_name: msg.sender_participant_name || null,
          message_text: msg.message,
          message_type: messageType,
          has_media: hasMedia,
          sent_at: msg.time_sent.toISOString(),
        });

        if (messageId) {
          result.messagesSynced++;
        }

        lastTimestamp = msg.time_sent.toISOString();
      } catch (error) {
        const err = handleError(error);
        result.errors.push({
          messageId: msg.message_id,
          error: err.message,
        });
        logger.error("Failed to sync message", {
          tenantId,
          messageId: msg.message_id,
          error: err.message,
        });
      }
    }

    // Update sync status
    await updateSyncStatus("messages", "success", {
      lastSyncedTimestamp: lastTimestamp || undefined,
      recordsSynced: result.messagesSynced,
      tenantId,
    });

    logger.info("Message sync completed", {
      tenantId,
      synced: result.messagesSynced,
      conversations: result.conversationsCreated,
      errors: result.errors.length,
    });

    return result;
  } catch (error) {
    const err = handleError(error);
    logger.error("Message sync failed", { tenantId, error: err.message });
    await updateSyncStatus("messages", "error", {
      errorMessage: err.message,
      tenantId,
    });
    throw err;
  }
}
