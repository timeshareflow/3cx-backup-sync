import { Pool } from "pg";
import { logger } from "../utils/logger";
import { handleError } from "../utils/errors";
import {
  getNewMessages,
  getConversations,
  getAllLiveConversations,
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

// Map 3CX provider_type to our channel_type
function mapProviderToChannel(providerType: string | null): string {
  if (!providerType) return "internal";

  const type = providerType.toLowerCase();

  // Direct mappings for known types
  if (type.includes("sms")) return "sms";
  if (type.includes("mms")) return "mms";
  if (type.includes("facebook") || type.includes("fb")) return "facebook";
  if (type.includes("whatsapp") || type.includes("wa")) return "whatsapp";
  if (type.includes("livechat") || type.includes("webchat")) return "livechat";
  if (type.includes("telegram")) return "telegram";
  if (type.includes("teams")) return "teams";

  // Return the original if no mapping found
  return type || "internal";
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

// Sync all conversations from live table (including empty ones)
async function syncAllConversations(
  pool: Pool | undefined,
  tenantId: string | undefined
): Promise<{ created: number; updated: number }> {
  let conversationsCreated = 0;
  let conversationsUpdated = 0;

  try {
    // Get ALL conversations from live table, including empty group chats
    const liveConversations = await getAllLiveConversations(pool);

    for (const conv of liveConversations) {
      try {
        // Check if conversation already exists in Supabase
        const existingId = await getConversationId(conv.conversation_id, tenantId);

        if (!existingId) {
          // Create the conversation - participants will be synced when messages come in
          await upsertConversation({
            threecx_conversation_id: conv.conversation_id,
            conversation_name: conv.chat_name || null,
            channel_type: "internal", // Default, will be updated when messages sync
            is_external: conv.is_external,
            is_group_chat: conv.is_group_chat, // Use is_group_chat from 3CX data
            tenant_id: tenantId,
          });

          conversationsCreated++;

          logger.debug(`Created conversation from live table: ${conv.conversation_id}`, {
            name: conv.chat_name,
            messageCount: conv.message_count,
            isGroupChat: conv.is_group_chat,
          });
        } else {
          // Update existing conversation with latest data (name and is_group_chat)
          await upsertConversation({
            threecx_conversation_id: conv.conversation_id,
            conversation_name: conv.chat_name || null,
            channel_type: "internal",
            is_external: conv.is_external,
            is_group_chat: conv.is_group_chat,
            tenant_id: tenantId,
          });
          conversationsUpdated++;

          logger.debug(`Updated conversation: ${conv.conversation_id}`, {
            name: conv.chat_name,
            isGroupChat: conv.is_group_chat,
          });
        }
      } catch (error) {
        logger.warn(`Failed to sync conversation ${conv.conversation_id}`, {
          error: (error as Error).message,
        });
      }
    }

    if (conversationsCreated > 0 || conversationsUpdated > 0) {
      logger.info(`Conversations from live table: ${conversationsCreated} created, ${conversationsUpdated} updated`);
    }
  } catch (error) {
    logger.warn("Failed to sync live conversations", {
      error: (error as Error).message,
    });
  }

  return { created: conversationsCreated, updated: conversationsUpdated };
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

    // First, sync ALL conversations from live table (including empty group chats)
    // This ensures new group chats are visible even before their first message
    const conversationSync = await syncAllConversations(pool, tenantId);
    result.conversationsCreated += conversationSync.created;

    // Get last synced timestamp
    let lastSynced = await getLastSyncedTimestamp("messages", tenantId);
    logger.info("Starting message sync", {
      tenantId,
      lastSynced: lastSynced?.toISOString() || "never",
    });

    // Paginate through all new messages
    let hasMoreMessages = true;
    let totalProcessed = 0;
    let lastTimestamp: string | null = null;

    while (hasMoreMessages) {
      // Fetch new messages from 3CX
      const messages = await getNewMessages(lastSynced, batchSize, pool);

      if (messages.length === 0) {
        hasMoreMessages = false;
        if (totalProcessed === 0) {
          logger.info("No new messages to sync", { tenantId });
        }
        break;
      }

      logger.info(`Processing batch of ${messages.length} messages`, {
        tenantId,
        totalProcessed,
        batchStart: messages[0]?.time_sent?.toISOString(),
      });

      // Group messages by conversation
      const conversationIds = [...new Set(messages.map((m) => m.conversation_id))];

      // Fetch conversation metadata for any new conversations
      const conversations = await getConversations(conversationIds, pool);
      const conversationMap = new Map(
        conversations.map((c) => [c.conversation_id, c])
      );

      // Process each message
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
              channel_type: mapProviderToChannel(convMeta?.provider_type || null),
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
                  tenant_id: tenantId,
                });
              }

              // Also add the sender as participant if not in array
              if (msg.sender_participant_no) {
                await upsertParticipant({
                  conversation_id: supabaseConversationId,
                  extension_number: msg.sender_participant_no,
                  display_name: msg.sender_participant_name || null,
                  participant_type: msg.is_external ? "external" : "extension",
                  tenant_id: tenantId,
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
            tenant_id: tenantId,
          });

          if (messageId) {
            result.messagesSynced++;
          }

          // Store the timestamp with a 1ms buffer to avoid re-fetching the same message
          // due to microsecond precision differences between PostgreSQL and JavaScript
          const msgTimestamp = new Date(msg.time_sent.getTime() + 1);
          lastTimestamp = msgTimestamp.toISOString();
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

      totalProcessed += messages.length;

      // Update the cursor for next batch - use the last message's timestamp + 1ms buffer
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        lastSynced = new Date(lastMsg.time_sent.getTime() + 1);
      }

      // If we got fewer messages than batchSize, we've reached the end
      if (messages.length < batchSize) {
        hasMoreMessages = false;
      }

      // Save progress after each batch
      if (lastTimestamp) {
        await updateSyncStatus("messages", "running", {
          lastSyncedTimestamp: lastTimestamp,
          recordsSynced: result.messagesSynced,
          tenantId,
        });
      }
    }

    // Final update sync status
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
      totalProcessed,
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
