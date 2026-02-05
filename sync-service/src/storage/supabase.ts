import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../utils/logger";
import { SupabaseError } from "../utils/errors";

let supabase: SupabaseClient | null = null;

/**
 * Initialize Supabase client with custom credentials.
 * Used by local mode agent to use credentials received from the API.
 */
export function initSupabaseClient(url: string, key: string): void {
  supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  logger.info("Supabase client initialized with custom credentials");
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new SupabaseError("Missing Supabase credentials (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required)");
    }

    supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    logger.info("Supabase client initialized for 3CX BackupWiz");
  }

  return supabase;
}

// Upsert conversation
export async function upsertConversation(conversation: {
  threecx_conversation_id: string;
  conversation_name?: string | null;
  channel_type?: string | null;
  is_external?: boolean;
  is_group_chat?: boolean;
  participant_count?: number;
  tenant_id?: string;
}): Promise<string> {
  const client = getSupabaseClient();

  const insertData: Record<string, unknown> = {
    threecx_conversation_id: conversation.threecx_conversation_id,
    conversation_name: conversation.conversation_name,
    channel_type: conversation.channel_type ?? "internal",
    is_external: conversation.is_external ?? false,
    is_group_chat: conversation.is_group_chat ?? false,
    participant_count: conversation.participant_count ?? 2,
  };

  if (conversation.tenant_id) {
    insertData.tenant_id = conversation.tenant_id;
  }

  // Use correct column order to match the unique index: (tenant_id, threecx_conversation_id)
  const { data, error } = await client
    .from("conversations")
    .upsert(insertData, {
      onConflict: conversation.tenant_id
        ? "tenant_id,threecx_conversation_id"
        : "threecx_conversation_id"
    })
    .select("id")
    .single();

  if (error) {
    throw new SupabaseError("Failed to upsert conversation", { error, insertData });
  }

  return data.id;
}

// Update conversation name from participant names (for 1-on-1 chats)
export async function updateConversationNameFromParticipants(
  conversationId: string
): Promise<void> {
  const client = getSupabaseClient();

  // Get conversation info
  const { data: conv } = await client
    .from("conversations")
    .select("is_group_chat, conversation_name")
    .eq("id", conversationId)
    .single();

  // Only update 1-on-1 chats (group chats have their own names)
  if (conv?.is_group_chat) {
    return;
  }

  // Get participants
  const { data: participants } = await client
    .from("participants")
    .select("external_name")
    .eq("conversation_id", conversationId);

  if (!participants || participants.length === 0) {
    return;
  }

  // Build name from all participant names
  const validNames = participants
    .map(p => p.external_name)
    .filter(Boolean);

  if (validNames.length === 0) {
    return;
  }

  // Don't overwrite a multi-participant name with a single-participant name
  // This prevents losing 3CX-provided names when we only have partial participant data
  const currentName = conv?.conversation_name || "";
  const currentCommaCount = (currentName.match(/,/g) || []).length;
  if (validNames.length === 1 && currentCommaCount >= 1) {
    // Current name has multiple participants but we only have 1 stored - keep the current name
    return;
  }

  const names = validNames.sort().join(", ");

  // Update the conversation name
  await client
    .from("conversations")
    .update({ conversation_name: names })
    .eq("id", conversationId);
}

// Upsert participant
export async function upsertParticipant(participant: {
  conversation_id: string;
  extension_number?: string | null;
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
  participant_type?: string;
  tenant_id?: string;
}): Promise<void> {
  const client = getSupabaseClient();

  // Check if participant already exists
  const { data: existing } = await client
    .from("participants")
    .select("id, extension_id")
    .eq("conversation_id", participant.conversation_id)
    .eq("external_id", participant.extension_number || "")
    .single();

  // Look up the extension UUID by extension_number + tenant_id
  let extensionId: string | null = null;
  if (participant.extension_number && participant.tenant_id && participant.participant_type !== "external") {
    const { data: ext } = await client
      .from("extensions")
      .select("id")
      .eq("extension_number", participant.extension_number)
      .eq("tenant_id", participant.tenant_id)
      .single();

    extensionId = ext?.id || null;
  }

  if (existing) {
    // Update extension_id if it was missing, and always update display name
    const updates: Record<string, unknown> = {};

    if (!existing.extension_id && extensionId) {
      updates.extension_id = extensionId;
    }

    // Always update the display name if provided (to capture name changes)
    if (participant.display_name) {
      updates.external_name = participant.display_name;
    }

    if (Object.keys(updates).length > 0) {
      await client
        .from("participants")
        .update(updates)
        .eq("id", existing.id);
    }
    return;
  }

  const { error } = await client.from("participants").insert({
    conversation_id: participant.conversation_id,
    external_id: participant.extension_number,
    external_name: participant.display_name,
    external_number: participant.participant_type === "external" ? participant.phone : null,
    participant_type: participant.participant_type || "extension",
    extension_id: extensionId,
    joined_at: new Date().toISOString(),
  });

  if (error) {
    logger.warn("Failed to insert participant", { error, participant });
  }
}

// Insert message (skip if exists)
export async function insertMessage(message: {
  conversation_id: string;
  threecx_message_id: string;
  sender_extension?: string | null;
  sender_name?: string | null;
  message_text?: string | null;
  message_type?: string;
  has_media?: boolean;
  sent_at: string;
  tenant_id?: string;
}): Promise<string | null> {
  const client = getSupabaseClient();

  // Check if message already exists
  if (message.tenant_id) {
    const { data: existing } = await client
      .from("messages")
      .select("id")
      .eq("tenant_id", message.tenant_id)
      .eq("threecx_message_id", message.threecx_message_id)
      .single();

    if (existing) {
      return null; // Already exists
    }
  }

  const insertData: Record<string, unknown> = {
    conversation_id: message.conversation_id,
    threecx_message_id: message.threecx_message_id,
    sender_identifier: message.sender_extension,
    sender_name: message.sender_name,
    content: message.message_text,
    message_type: message.message_type || "text",
    has_media: message.has_media || false,
    sent_at: message.sent_at,
  };

  if (message.tenant_id) {
    insertData.tenant_id = message.tenant_id;
  }

  const { data, error } = await client
    .from("messages")
    .insert(insertData)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Duplicate - already exists
      return null;
    }
    logger.error("Message insert failed", {
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      messageId: message.threecx_message_id,
    });
    throw new SupabaseError("Failed to insert message", { error });
  }

  return data?.id || null;
}

// Insert media file record
export async function insertMediaFile(media: {
  message_id?: string | null;
  conversation_id: string;
  original_filename?: string | null;
  stored_filename?: string | null;
  file_type: string;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  s3_key: string;
  s3_bucket: string;
}): Promise<string> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("media_files")
    .upsert(
      {
        message_id: media.message_id,
        conversation_id: media.conversation_id,
        original_filename: media.original_filename,
        stored_filename: media.stored_filename,
        file_type: media.file_type,
        mime_type: media.mime_type,
        file_size_bytes: media.file_size_bytes,
        s3_key: media.s3_key,
        s3_bucket: media.s3_bucket,
      },
      { onConflict: "s3_key" }
    )
    .select("id")
    .single();

  if (error) {
    throw new SupabaseError("Failed to insert media file", { error });
  }

  return data.id;
}

// Upsert extension - returns { changed: true, extensionId } if the name was updated
export async function upsertExtension(extension: {
  extension_number: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  email?: string | null;
  tenant_id?: string;
}): Promise<{ changed: boolean; extensionId: string | null }> {
  const client = getSupabaseClient();

  const displayName =
    extension.display_name ||
    [extension.first_name, extension.last_name].filter(Boolean).join(" ") ||
    null;

  // Check if extension already exists with different name
  let nameChanged = false;
  let extensionId: string | null = null;

  if (extension.tenant_id) {
    const { data: existing } = await client
      .from("extensions")
      .select("id, display_name, first_name, last_name")
      .eq("tenant_id", extension.tenant_id)
      .eq("extension_number", extension.extension_number)
      .single();

    if (existing) {
      extensionId = existing.id;
      // Detect name change
      if (
        existing.display_name !== displayName ||
        existing.first_name !== (extension.first_name || null) ||
        existing.last_name !== (extension.last_name || null)
      ) {
        nameChanged = true;
        logger.info("Extension name changed", {
          extensionNumber: extension.extension_number,
          oldName: existing.display_name,
          newName: displayName,
        });
      }
    }
  }

  const now = new Date().toISOString();
  const insertData: Record<string, unknown> = {
    extension_number: extension.extension_number,
    first_name: extension.first_name,
    last_name: extension.last_name,
    display_name: displayName,
    email: extension.email,
    last_synced_at: now,
    updated_at: now,
  };

  if (extension.tenant_id) {
    insertData.tenant_id = extension.tenant_id;
  }

  // Use correct column order to match the unique index: (tenant_id, extension_number)
  const { data, error } = await client.from("extensions").upsert(insertData, {
    onConflict: extension.tenant_id
      ? "tenant_id,extension_number"
      : "extension_number",
  }).select("id").single();

  if (error) {
    logger.warn("Failed to upsert extension", {
      error,
      extension,
      onConflict: extension.tenant_id ? "tenant_id,extension_number" : "extension_number"
    });
    throw new Error(`Failed to upsert extension ${extension.extension_number}: ${error.message}`);
  }

  return { changed: nameChanged, extensionId: data?.id || extensionId };
}

// Cascade extension name change to all participants and conversation names
export async function cascadeExtensionNameChange(
  extensionId: string,
  newDisplayName: string,
  extensionNumber: string
): Promise<{ participantsUpdated: number; conversationsUpdated: number }> {
  const client = getSupabaseClient();
  let participantsUpdated = 0;
  let conversationsUpdated = 0;

  // Build the new participant display name: "Name (ext)"
  const newExternalName = `${newDisplayName} (${extensionNumber})`;

  // 1. Update all participant records that reference this extension
  const { data: updatedParticipants, error: partError } = await client
    .from("participants")
    .update({ external_name: newExternalName })
    .eq("extension_id", extensionId)
    .neq("external_name", newExternalName)
    .select("conversation_id");

  if (partError) {
    logger.error("Failed to cascade name to participants", {
      extensionId,
      error: partError.message,
    });
    return { participantsUpdated: 0, conversationsUpdated: 0 };
  }

  participantsUpdated = updatedParticipants?.length || 0;

  if (participantsUpdated === 0) {
    return { participantsUpdated: 0, conversationsUpdated: 0 };
  }

  // 2. Rebuild conversation names for all affected conversations
  const affectedConversationIds = [
    ...new Set(updatedParticipants.map((p) => p.conversation_id)),
  ];

  for (const convId of affectedConversationIds) {
    try {
      await updateConversationNameFromParticipants(convId);
      conversationsUpdated++;
    } catch (error) {
      logger.warn("Failed to update conversation name after extension rename", {
        conversationId: convId,
        error: (error as Error).message,
      });
    }
  }

  logger.info("Cascaded extension name change", {
    extensionId,
    newDisplayName,
    participantsUpdated,
    conversationsUpdated,
  });

  return { participantsUpdated, conversationsUpdated };
}

// Bulk refresh ALL participant names from current extension data
// This catches stale names from before cascade code was deployed
export async function refreshAllParticipantNames(
  tenantId?: string
): Promise<{ participantsUpdated: number; conversationsUpdated: number }> {
  const client = getSupabaseClient();
  let participantsUpdated = 0;
  let conversationsUpdated = 0;

  // Get all extensions with current names
  let extQuery = client
    .from("extensions")
    .select("id, extension_number, display_name, first_name, last_name");

  if (tenantId) {
    extQuery = extQuery.eq("tenant_id", tenantId);
  }

  const { data: extensions, error: extError } = await extQuery;

  if (extError || !extensions) {
    logger.error("Failed to fetch extensions for name refresh", {
      error: extError?.message,
    });
    return { participantsUpdated: 0, conversationsUpdated: 0 };
  }

  const affectedConversationIds = new Set<string>();

  for (const ext of extensions) {
    const displayName =
      ext.display_name ||
      [ext.first_name, ext.last_name].filter(Boolean).join(" ") ||
      null;

    if (!displayName) continue;

    const expectedName = `${displayName} (${ext.extension_number})`;

    // Update all participants with this extension_id that have a different name
    const { data: updated, error: updateError } = await client
      .from("participants")
      .update({ external_name: expectedName })
      .eq("extension_id", ext.id)
      .neq("external_name", expectedName)
      .select("conversation_id");

    if (updateError) {
      logger.warn("Failed to refresh participant name", {
        extensionId: ext.id,
        error: updateError.message,
      });
      continue;
    }

    if (updated && updated.length > 0) {
      participantsUpdated += updated.length;
      for (const p of updated) {
        affectedConversationIds.add(p.conversation_id);
      }
      logger.debug("Refreshed participant names", {
        extensionNumber: ext.extension_number,
        newName: expectedName,
        count: updated.length,
      });
    }
  }

  // Rebuild conversation names for all affected conversations
  for (const convId of affectedConversationIds) {
    try {
      await updateConversationNameFromParticipants(convId);
      conversationsUpdated++;
    } catch (error) {
      logger.warn("Failed to update conversation name during refresh", {
        conversationId: convId,
        error: (error as Error).message,
      });
    }
  }

  if (participantsUpdated > 0) {
    logger.info("Bulk participant name refresh completed", {
      tenantId,
      participantsUpdated,
      conversationsUpdated,
    });
  }

  return { participantsUpdated, conversationsUpdated };
}

// Merge duplicate 1-on-1 conversations that share the same set of participants
// Keeps the conversation with the most recent activity and moves messages from duplicates
export async function mergeDuplicateConversations(
  tenantId?: string
): Promise<{ mergedCount: number; messagesMoved: number }> {
  const client = getSupabaseClient();
  let mergedCount = 0;
  let messagesMoved = 0;

  // Get all non-group conversations with their participants
  let convQuery = client
    .from("conversations")
    .select("id, conversation_name, is_group_chat, message_count, last_message_at, created_at")
    .eq("is_group_chat", false);

  if (tenantId) {
    convQuery = convQuery.eq("tenant_id", tenantId);
  }

  const { data: conversations, error: convError } = await convQuery;

  if (convError || !conversations) {
    logger.error("Failed to fetch conversations for dedup", { error: convError?.message });
    return { mergedCount: 0, messagesMoved: 0 };
  }

  // Get all participants for these conversations
  const convIds = conversations.map(c => c.id);
  if (convIds.length === 0) return { mergedCount: 0, messagesMoved: 0 };

  const { data: allParticipants } = await client
    .from("participants")
    .select("conversation_id, extension_id, external_id")
    .in("conversation_id", convIds);

  if (!allParticipants) return { mergedCount: 0, messagesMoved: 0 };

  // Group participants by conversation
  const convParticipants: Record<string, string[]> = {};
  for (const p of allParticipants) {
    if (!convParticipants[p.conversation_id]) convParticipants[p.conversation_id] = [];
    const key = p.extension_id || p.external_id || "";
    if (key) convParticipants[p.conversation_id].push(key);
  }

  // Build participant set keys and group conversations
  const participantGroups: Record<string, typeof conversations> = {};
  for (const conv of conversations) {
    const parts = convParticipants[conv.id] || [];
    if (parts.length === 0) continue;
    const key = [...parts].sort().join("|");
    if (!participantGroups[key]) participantGroups[key] = [];
    participantGroups[key].push(conv);
  }

  // Merge groups with more than one conversation
  for (const [, group] of Object.entries(participantGroups)) {
    if (group.length <= 1) continue;

    // Sort: most recent activity first, then most messages
    group.sort((a, b) => {
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
      return b.message_count - a.message_count;
    });

    const primary = group[0];
    const duplicates = group.slice(1);

    for (const dup of duplicates) {
      try {
        // Move messages from duplicate to primary
        const { data: movedMsgs, error: moveError } = await client
          .from("messages")
          .update({ conversation_id: primary.id })
          .eq("conversation_id", dup.id)
          .select("id");

        if (moveError) {
          logger.warn("Failed to move messages during merge", {
            from: dup.id,
            to: primary.id,
            error: moveError.message,
          });
          continue;
        }

        const movedCount = movedMsgs?.length || 0;
        messagesMoved += movedCount;

        // Move media files from duplicate to primary
        await client
          .from("media_files")
          .update({ conversation_id: primary.id })
          .eq("conversation_id", dup.id);

        // Delete duplicate participants (primary already has them)
        await client
          .from("participants")
          .delete()
          .eq("conversation_id", dup.id);

        // Delete the duplicate conversation
        const { error: deleteError } = await client
          .from("conversations")
          .delete()
          .eq("id", dup.id);

        if (deleteError) {
          logger.warn("Failed to delete duplicate conversation", {
            id: dup.id,
            error: deleteError.message,
          });
          continue;
        }

        // Update primary conversation message count and last_message_at
        const { data: msgStats } = await client
          .from("messages")
          .select("sent_at")
          .eq("conversation_id", primary.id)
          .order("sent_at", { ascending: false })
          .limit(1);

        const newCount = (primary.message_count || 0) + movedCount;
        const lastMsg = msgStats?.[0]?.sent_at || primary.last_message_at;

        await client
          .from("conversations")
          .update({
            message_count: newCount,
            last_message_at: lastMsg,
          })
          .eq("id", primary.id);

        mergedCount++;

        logger.info("Merged duplicate conversation", {
          duplicateId: dup.id,
          primaryId: primary.id,
          primaryName: primary.conversation_name,
          messagesMoved: movedCount,
        });
      } catch (error) {
        logger.warn("Failed to merge conversation", {
          duplicateId: dup.id,
          primaryId: primary.id,
          error: (error as Error).message,
        });
      }
    }
  }

  if (mergedCount > 0) {
    logger.info("Duplicate conversation merge completed", {
      tenantId,
      mergedCount,
      messagesMoved,
    });
  }

  return { mergedCount, messagesMoved };
}

// Get or create conversation ID by 3CX ID
export async function getConversationId(
  threecxConversationId: string,
  tenantId?: string
): Promise<string | null> {
  const client = getSupabaseClient();

  let query = client
    .from("conversations")
    .select("id")
    .eq("threecx_conversation_id", threecxConversationId);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // Not found
    }
    throw new SupabaseError("Failed to get conversation ID", { error });
  }

  return data?.id || null;
}

// Get count of unlinked media files (no message_id)
export async function getUnlinkedMediaCount(
  tenantId: string
): Promise<number> {
  const client = getSupabaseClient();
  const { count, error } = await client
    .from("media_files")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("message_id", null);

  if (error) {
    logger.error("Failed to count unlinked media", { error: error.message });
    return 0;
  }
  return count || 0;
}

// Bulk lookup Supabase messages by their 3CX message IDs
export async function getMessagesByThreecxIds(
  threecxIds: string[],
  tenantId: string
): Promise<Array<{ threecx_message_id: string; id: string; conversation_id: string }>> {
  if (threecxIds.length === 0) return [];

  const client = getSupabaseClient();
  const results: Array<{ threecx_message_id: string; id: string; conversation_id: string }> = [];

  // Query in batches of 100 to avoid URL length limits
  for (let i = 0; i < threecxIds.length; i += 100) {
    const batch = threecxIds.slice(i, i + 100);
    const { data, error } = await client
      .from("messages")
      .select("id, threecx_message_id, conversation_id")
      .eq("tenant_id", tenantId)
      .in("threecx_message_id", batch);

    if (error) {
      logger.error("Failed to lookup messages by threecx IDs", { error: error.message });
      continue;
    }

    if (data) {
      results.push(...data);
    }
  }

  return results;
}

// Update sync status - uses upsert to create if not exists
export async function updateSyncStatus(
  syncType: string,
  status: "idle" | "running" | "success" | "error",
  details?: {
    lastSyncedTimestamp?: string;
    lastSyncedMessageId?: string;
    recordsSynced?: number;
    errorMessage?: string;
    notes?: string;
    tenantId?: string;
  }
): Promise<void> {
  const client = getSupabaseClient();

  if (!details?.tenantId) {
    logger.error("updateSyncStatus requires tenantId");
    return;
  }

  const now = new Date().toISOString();
  const record: Record<string, unknown> = {
    tenant_id: details.tenantId,
    sync_type: syncType,
    status,
    last_sync_at: now,
    updated_at: now,
  };

  if (status === "success") {
    record.last_success_at = now;
    record.last_error = null;
    // Store the timestamp of the last synced message for incremental sync
    if (details.lastSyncedTimestamp) {
      record.last_synced_message_at = details.lastSyncedTimestamp;
    }
  }

  if (status === "error" && details?.errorMessage) {
    record.last_error_at = now;
    record.last_error = details.errorMessage;
  }

  if (details?.recordsSynced !== undefined) {
    record.items_synced = details.recordsSynced;
  }

  // Add notes for detailed status information
  if (details?.notes !== undefined) {
    record.notes = details.notes;
  }

  // Use upsert to create record if it doesn't exist
  const { error } = await client
    .from("sync_status")
    .upsert(record, {
      onConflict: "tenant_id,sync_type",
    });

  if (error) {
    logger.error("Failed to update sync status", { error, syncType, tenantId: details.tenantId });
  }
}

// Get last synced message timestamp for incremental sync
export async function getLastSyncedTimestamp(
  syncType: string,
  tenantId?: string
): Promise<Date | null> {
  const client = getSupabaseClient();

  if (!tenantId) {
    logger.warn("getLastSyncedTimestamp called without tenantId");
    return null;
  }

  // Query for the last_synced_message_at which tracks the actual message timestamp
  const { data, error } = await client
    .from("sync_status")
    .select("last_synced_message_at")
    .eq("sync_type", syncType)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !data?.last_synced_message_at) {
    // No record or no timestamp - this is a fresh sync
    return null;
  }

  return new Date(data.last_synced_message_at);
}

// Create sync log entry
export async function createSyncLog(log: {
  sync_type: string;
  started_at: string;
  status?: string;
  tenant_id?: string;
}): Promise<string> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("sync_logs")
    .insert({
      tenant_id: log.tenant_id,
      sync_type: log.sync_type,
      status: log.status || "running",
      message: "Sync started",
      items_processed: 0,
      items_failed: 0,
    })
    .select("id")
    .single();

  if (error) {
    logger.error("Failed to create sync log", { error });
    throw new SupabaseError("Failed to create sync log", { error });
  }

  return data.id;
}

// Update sync log
export async function updateSyncLog(
  logId: string,
  updates: {
    completed_at?: string;
    status?: string;
    messages_synced?: number;
    media_synced?: number;
    errors_count?: number;
    error_details?: Record<string, unknown>;
  }
): Promise<void> {
  const client = getSupabaseClient();

  // Map to actual column names from schema
  const dbUpdates: Record<string, unknown> = {
    status: updates.status,
  };

  if (updates.messages_synced !== undefined || updates.media_synced !== undefined) {
    dbUpdates.items_processed = (updates.messages_synced || 0) + (updates.media_synced || 0);
  }

  if (updates.errors_count !== undefined) {
    dbUpdates.items_failed = updates.errors_count;
  }

  if (updates.error_details) {
    dbUpdates.details = updates.error_details;
    dbUpdates.message = updates.error_details.message || "Sync completed with errors";
  } else if (updates.status === "success") {
    dbUpdates.message = "Sync completed successfully";
  }

  const { error } = await client
    .from("sync_logs")
    .update(dbUpdates)
    .eq("id", logId);

  if (error) {
    logger.error("Failed to update sync log", { error, logId });
  }
}

// ============================================
// CALL RECORDINGS
// ============================================

export async function insertCallRecording(recording: {
  tenant_id: string;
  threecx_recording_id?: string;
  threecx_call_id?: string;
  caller_number?: string;
  caller_name?: string;
  callee_number?: string;
  callee_name?: string;
  extension?: string;
  direction?: "inbound" | "outbound" | "internal";
  original_filename?: string;
  file_size: number;
  storage_path: string;
  mime_type?: string;
  duration_seconds?: number;
  transcription?: string;
  call_started_at?: string;
  call_ended_at?: string;
  recorded_at: string;
  storage_backend?: string; // 'supabase' or 'spaces'
}): Promise<string> {
  const client = getSupabaseClient();

  // Map to actual database column names (matching actual Supabase table)
  const dbRecord = {
    tenant_id: recording.tenant_id,
    threecx_call_id: recording.threecx_recording_id || recording.threecx_call_id,
    file_name: recording.original_filename || "recording.wav",
    file_size: recording.file_size,
    storage_path: recording.storage_path,
    caller_number: recording.caller_number,
    caller_name: recording.caller_name,
    callee_number: recording.callee_number,
    callee_name: recording.callee_name,
    direction: recording.direction,
    duration_seconds: recording.duration_seconds,
    started_at: recording.recorded_at || recording.call_started_at || new Date().toISOString(),
    ended_at: recording.call_ended_at,
    storage_backend: recording.storage_backend || "supabase",
  };

  const { data, error } = await client
    .from("call_recordings")
    .upsert(dbRecord, {
      onConflict: "tenant_id,threecx_call_id",
      ignoreDuplicates: true,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Duplicate - return existing
      const { data: existing } = await client
        .from("call_recordings")
        .select("id")
        .eq("tenant_id", recording.tenant_id)
        .eq("threecx_call_id", dbRecord.threecx_call_id)
        .single();
      return existing?.id || "";
    }
    // Log full error details for debugging
    logger.error("Call recording insert failed", {
      errorCode: error.code,
      errorMessage: error.message,
      errorDetails: error.details,
      errorHint: error.hint,
      recordingId: dbRecord.threecx_call_id,
    });
    throw new SupabaseError("Failed to insert call recording", { error });
  }

  return data?.id || "";
}

// Check if a recording already exists in database
export async function recordingExists(tenantId: string, recordingId: string): Promise<boolean> {
  const client = getSupabaseClient();

  const { count, error } = await client
    .from("call_recordings")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("threecx_call_id", recordingId);

  if (error) {
    return false;
  }

  return (count || 0) > 0;
}

// Check if a voicemail already exists in database
export async function voicemailExists(tenantId: string, voicemailId: string): Promise<boolean> {
  const client = getSupabaseClient();

  const { count, error } = await client
    .from("voicemails")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("threecx_voicemail_id", voicemailId);

  if (error) {
    return false;
  }

  return (count || 0) > 0;
}

// ============================================
// VOICEMAILS
// ============================================

export async function insertVoicemail(voicemail: {
  tenant_id: string;
  threecx_voicemail_id?: string;
  extension: string;
  caller_number?: string;
  caller_name?: string;
  original_filename?: string;
  file_size: number;
  storage_path: string;
  duration_seconds?: number;
  is_read?: boolean;
  transcription?: string;
  received_at: string;
  storage_backend?: string; // 'supabase' or 'spaces'
}): Promise<string> {
  const client = getSupabaseClient();

  // Look up extension UUID by extension number
  let extensionId: string | null = null;
  if (voicemail.extension) {
    const { data: ext } = await client
      .from("extensions")
      .select("id")
      .eq("extension_number", voicemail.extension)
      .eq("tenant_id", voicemail.tenant_id)
      .single();
    extensionId = ext?.id || null;
  }

  // Map to actual database column names (matching actual Supabase table)
  const dbRecord = {
    tenant_id: voicemail.tenant_id,
    threecx_voicemail_id: voicemail.threecx_voicemail_id,
    extension_id: extensionId,
    file_name: voicemail.original_filename || "voicemail.wav",
    file_size: voicemail.file_size,
    storage_path: voicemail.storage_path,
    caller_number: voicemail.caller_number,
    caller_name: voicemail.caller_name,
    duration_seconds: voicemail.duration_seconds,
    is_read: voicemail.is_read ?? false,
    transcription: voicemail.transcription,
    received_at: voicemail.received_at,
    storage_backend: voicemail.storage_backend || "supabase",
  };

  const { data, error } = await client
    .from("voicemails")
    .upsert(dbRecord, {
      onConflict: "tenant_id,threecx_voicemail_id",
      ignoreDuplicates: true,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await client
        .from("voicemails")
        .select("id")
        .eq("tenant_id", voicemail.tenant_id)
        .eq("threecx_voicemail_id", voicemail.threecx_voicemail_id)
        .single();
      return existing?.id || "";
    }
    // Log full error details for debugging
    logger.error("Voicemail insert failed", {
      errorCode: error.code,
      errorMessage: error.message,
      errorDetails: error.details,
      errorHint: error.hint,
      voicemailId: voicemail.threecx_voicemail_id,
    });
    throw new SupabaseError("Failed to insert voicemail", { error });
  }

  return data?.id || "";
}

// ============================================
// FAXES
// ============================================

export async function insertFax(fax: {
  tenant_id: string;
  threecx_fax_id?: string;
  extension?: string;
  extension_name?: string;
  remote_number?: string;
  remote_name?: string;
  direction?: "inbound" | "outbound";
  original_filename?: string;
  file_size: number;
  storage_path: string;
  mime_type?: string;
  page_count?: number;
  status?: string;
  fax_time: string;
  storage_backend?: string; // 'supabase' or 'spaces'
}): Promise<string> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("faxes")
    .upsert(fax, {
      onConflict: "tenant_id,threecx_fax_id",
      ignoreDuplicates: true,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await client
        .from("faxes")
        .select("id")
        .eq("tenant_id", fax.tenant_id)
        .eq("threecx_fax_id", fax.threecx_fax_id)
        .single();
      return existing?.id || "";
    }
    throw new SupabaseError("Failed to insert fax", { error });
  }

  return data?.id || "";
}

// ============================================
// CALL LOGS (CDR)
// ============================================

export async function insertCallLog(callLog: {
  tenant_id: string;
  threecx_call_id?: string;
  caller_number?: string;
  caller_name?: string;
  callee_number?: string;
  callee_name?: string;
  extension?: string;
  extension_name?: string;
  direction?: "inbound" | "outbound" | "internal";
  call_type?: string;
  status?: string;
  ring_duration_seconds?: number;
  talk_duration_seconds?: number;
  hold_duration_seconds?: number;
  total_duration_seconds?: number;
  call_started_at: string;
  call_answered_at?: string;
  call_ended_at?: string;
  has_recording?: boolean;
  recording_id?: string;
}): Promise<string> {
  const client = getSupabaseClient();

  // Map input properties to actual database column names
  const dbRecord = {
    tenant_id: callLog.tenant_id,
    threecx_call_id: callLog.threecx_call_id,
    caller_number: callLog.caller_number,
    caller_name: callLog.caller_name,
    callee_number: callLog.callee_number,
    callee_name: callLog.callee_name,
    direction: callLog.direction,
    call_type: callLog.call_type,
    status: callLog.status,
    ring_duration_seconds: callLog.ring_duration_seconds,
    duration_seconds: callLog.total_duration_seconds || callLog.talk_duration_seconds,
    started_at: callLog.call_started_at,
    answered_at: callLog.call_answered_at,
    ended_at: callLog.call_ended_at,
    recording_id: callLog.recording_id,
  };

  const { data, error } = await client
    .from("call_logs")
    .upsert(dbRecord, {
      onConflict: "tenant_id,threecx_call_id",
      ignoreDuplicates: true,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await client
        .from("call_logs")
        .select("id")
        .eq("tenant_id", callLog.tenant_id)
        .eq("threecx_call_id", callLog.threecx_call_id)
        .single();
      return existing?.id || "";
    }
    logger.error("Call log insert failed", {
      errorCode: error.code,
      errorMessage: error.message,
      callId: callLog.threecx_call_id,
    });
    throw new SupabaseError("Failed to insert call log", { error });
  }

  return data?.id || "";
}

// ============================================
// MEETING RECORDINGS
// ============================================

export async function insertMeetingRecording(meeting: {
  tenant_id: string;
  threecx_meeting_id?: string;
  meeting_name?: string;
  meeting_host?: string;
  host_extension?: string;
  participant_count?: number;
  participants?: unknown[];
  original_filename?: string;
  file_size: number;
  storage_path: string;
  mime_type?: string;
  duration_seconds?: number;
  width?: number;
  height?: number;
  has_audio?: boolean;
  has_video?: boolean;
  meeting_started_at?: string;
  meeting_ended_at?: string;
  recorded_at: string;
  storage_backend?: string; // 'supabase' or 'spaces'
}): Promise<string> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("meeting_recordings")
    .upsert(meeting, {
      onConflict: "tenant_id,threecx_meeting_id",
      ignoreDuplicates: true,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await client
        .from("meeting_recordings")
        .select("id")
        .eq("tenant_id", meeting.tenant_id)
        .eq("threecx_meeting_id", meeting.threecx_meeting_id)
        .single();
      return existing?.id || "";
    }
    throw new SupabaseError("Failed to insert meeting recording", { error });
  }

  return data?.id || "";
}

// ============================================
// MEDIA FILES (Updated for Supabase Storage)
// ============================================

export async function insertMediaFileNew(media: {
  tenant_id: string;
  message_id?: string | null;
  conversation_id?: string;
  original_filename?: string | null;
  stored_filename?: string | null;
  file_type: string;
  mime_type?: string | null;
  file_size: number;
  storage_path: string;
  thumbnail_path?: string;
  storage_backend?: string; // 'supabase' or 'spaces'
}): Promise<string> {
  const client = getSupabaseClient();

  // Build insert data
  // NOTE: Database has file_name (NOT NULL) - derive from original_filename or storage_path
  // Be extra defensive about null/undefined/empty values
  let fileName: string = "unknown";

  if (media.original_filename && typeof media.original_filename === "string" && media.original_filename.trim() !== "") {
    fileName = media.original_filename.trim();
  } else if (media.stored_filename && typeof media.stored_filename === "string" && media.stored_filename.trim() !== "") {
    fileName = media.stored_filename.trim();
  } else if (media.storage_path && typeof media.storage_path === "string") {
    const pathParts = media.storage_path.split("/");
    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart && lastPart.trim() !== "") {
      fileName = lastPart.trim();
    }
  }

  logger.debug("Preparing media file insert", {
    original_filename: media.original_filename,
    stored_filename: media.stored_filename,
    resolved_fileName: fileName,
    storage_path: media.storage_path,
  });

  const insertData: Record<string, unknown> = {
    tenant_id: media.tenant_id,
    storage_path: media.storage_path,
    mime_type: media.mime_type,
    file_size: media.file_size,
    file_name: fileName,  // Required NOT NULL column in database - never null
    storage_backend: media.storage_backend || "supabase", // Track storage location
  };

  // Optional fields
  if (media.message_id) {
    insertData.message_id = media.message_id;
  }
  if (media.conversation_id) {
    insertData.conversation_id = media.conversation_id;
  }

  const { data, error } = await client
    .from("media_files")
    .insert(insertData)
    .select("id")
    .single();

  if (error) {
    logger.error("Media file insert failed", {
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      storagePath: media.storage_path,
    });
    throw new SupabaseError("Failed to insert media file", { error });
  }

  return data.id;
}

// Get all synced filenames for a tenant+category (for fast duplicate checking)
// Extracts just the filename from storage_path to avoid date-based path mismatches
export async function getSyncedFilenames(
  tenantId: string,
  category: string
): Promise<Set<string>> {
  const client = getSupabaseClient();
  const filenames = new Set<string>();
  const prefix = `${tenantId}/${category}/`;

  // Paginate through all media files for this tenant/category
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await client
      .from("media_files")
      .select("storage_path")
      .eq("tenant_id", tenantId)
      .like("storage_path", `${prefix}%`)
      .range(offset, offset + pageSize - 1);

    if (error) {
      logger.error("Failed to fetch synced filenames", { tenantId, category, error: error.message });
      break;
    }

    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.storage_path) {
        // Extract just the base name WITHOUT extension (last segment of path, strip extension)
        // Extension changes after compression (e.g., .MOV -> .mp4, .jpeg -> .webp)
        // so we only compare the base name which is deterministic from the source file
        const parts = row.storage_path.split("/");
        const filename = parts[parts.length - 1];
        if (filename) {
          const dotIdx = filename.lastIndexOf(".");
          const baseName = dotIdx > 0 ? filename.substring(0, dotIdx) : filename;
          filenames.add(baseName);
        }
      }
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return filenames;
}

// Update media file with message link and original filename
export async function linkMediaToMessage(
  tenantId: string,
  internalFileName: string, // The hash/filename stored on disk
  messageId: string,
  originalFilename: string,
  conversationId?: string,
  fileInfo?: { Width?: number; Height?: number; Size?: number } | null
): Promise<boolean> {
  const client = getSupabaseClient();

  // Find media file by hash (the internal_file_name is stored as file_name in our DB)
  // The file_name might include or exclude the extension, so we check both
  const hashWithoutExt = internalFileName.replace(/\.[^/.]+$/, "");

  const { data: mediaFiles, error: findError } = await client
    .from("media_files")
    .select("id, file_name")
    .eq("tenant_id", tenantId)
    .or(`file_name.eq.${internalFileName},file_name.ilike.${hashWithoutExt}%`);

  if (findError) {
    logger.error("Failed to find media file by hash", {
      hash: internalFileName,
      tenantId,
      error: findError.message,
    });
    return false;
  }

  if (!mediaFiles || mediaFiles.length === 0) {
    logger.debug("No media file found for hash", { hash: internalFileName, tenantId });
    return false;
  }

  // Update the first matching file
  const mediaFile = mediaFiles[0];
  const updateData: Record<string, unknown> = {
    message_id: messageId,
    file_name: originalFilename, // Replace hash with original filename
  };

  if (conversationId) {
    updateData.conversation_id = conversationId;
  }

  // Add dimensions if available
  if (fileInfo?.Width) {
    updateData.width = fileInfo.Width;
  }
  if (fileInfo?.Height) {
    updateData.height = fileInfo.Height;
  }

  const { error: updateError } = await client
    .from("media_files")
    .update(updateData)
    .eq("id", mediaFile.id);

  if (updateError) {
    logger.error("Failed to update media file", {
      mediaId: mediaFile.id,
      error: updateError.message,
    });
    return false;
  }

  logger.info("Linked media to message", {
    mediaId: mediaFile.id,
    messageId,
    originalFilename,
  });

  return true;
}

// Link media file to message by matching original filename to message content
export async function linkMediaByFilename(
  tenantId: string,
  messageId: string,
  conversationId: string,
  messageContent: string
): Promise<boolean> {
  const client = getSupabaseClient();
  const filename = messageContent.trim();

  if (!filename) return false;

  // Match media_files.file_name to the message content (which is the filename)
  // Try exact match first, then case-insensitive
  const { data, error } = await client
    .from("media_files")
    .update({ message_id: messageId, conversation_id: conversationId })
    .eq("tenant_id", tenantId)
    .ilike("file_name", filename)
    .is("message_id", null)
    .select("id");

  if (error) {
    logger.error("Failed to link media by filename", {
      error: error.message,
      filename,
      messageId,
    });
    return false;
  }

  if (data && data.length > 0) {
    logger.info("Linked media to message by filename", {
      mediaId: data[0].id,
      messageId,
      conversationId,
      filename,
      matchCount: data.length,
    });
    return true;
  }

  // Fallback: try matching without file extension (media may have been compressed to different format)
  const filenameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  if (filenameWithoutExt !== filename) {
    const { data: fallbackData, error: fallbackError } = await client
      .from("media_files")
      .update({ message_id: messageId, conversation_id: conversationId })
      .eq("tenant_id", tenantId)
      .ilike("file_name", `${filenameWithoutExt}.%`)
      .is("message_id", null)
      .select("id");

    if (!fallbackError && fallbackData && fallbackData.length > 0) {
      logger.info("Linked media to message by filename (extension fallback)", {
        mediaId: fallbackData[0].id,
        messageId,
        conversationId,
        originalFilename: filename,
        matchCount: fallbackData.length,
      });
      return true;
    }
  }

  return false;
}

// Re-link orphaned media: find messages with has_media=true but no linked media_files,
// then try to match them to unlinked media files by filename
export async function relinkOrphanedMedia(
  tenantId: string
): Promise<{ linked: number; checked: number }> {
  const client = getSupabaseClient();
  let linked = 0;
  let checked = 0;

  // Find messages that claim to have media but have no linked media_files
  // We check by looking for messages with has_media=true where the content looks like a filename
  const { data: orphanedMessages, error: msgError } = await client
    .from("messages")
    .select("id, content, conversation_id")
    .eq("tenant_id", tenantId)
    .eq("has_media", true)
    .order("sent_at", { ascending: false })
    .limit(500);

  if (msgError || !orphanedMessages) {
    logger.error("Failed to fetch orphaned media messages", { error: msgError?.message });
    return { linked: 0, checked: 0 };
  }

  for (const msg of orphanedMessages) {
    if (!msg.content?.trim()) continue;

    // Check if this message already has linked media
    const { count: existingCount } = await client
      .from("media_files")
      .select("id", { count: "exact", head: true })
      .eq("message_id", msg.id);

    if ((existingCount || 0) > 0) continue; // Already linked

    checked++;

    // Try to link by filename
    const wasLinked = await linkMediaByFilename(
      tenantId,
      msg.id,
      msg.conversation_id,
      msg.content
    );

    if (wasLinked) {
      linked++;
    }
  }

  if (linked > 0) {
    logger.info("Re-linked orphaned media files", { tenantId, linked, checked });
  }

  return { linked, checked };
}

// ============================================
// TENANT HELPERS
// ============================================

export interface TenantConfig {
  id: string;
  name: string;
  slug: string;
  threecx_host: string;
  threecx_port: number;
  threecx_database: string;
  threecx_user: string;
  threecx_password: string;
  threecx_chat_files_path: string;
  threecx_recordings_path: string;
  threecx_voicemail_path: string;
  threecx_fax_path: string;
  threecx_meetings_path: string;
  backup_chats: boolean;
  backup_chat_media: boolean;
  backup_recordings: boolean;
  backup_voicemails: boolean;
  backup_faxes: boolean;
  backup_cdr: boolean;
  backup_meetings: boolean;
  sync_enabled: boolean;
  sync_interval_seconds: number;
}

export async function getActiveTenants(): Promise<TenantConfig[]> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("tenants")
    .select("*")
    .eq("is_active", true)
    .eq("sync_enabled", true)
    .not("threecx_host", "is", null);

  if (error) {
    throw new SupabaseError("Failed to get active tenants", { error });
  }

  return (data || []).map(t => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    threecx_host: t.threecx_host,
    threecx_port: t.threecx_port || 5432,
    threecx_database: t.threecx_database || "database_single",
    threecx_user: t.threecx_user || "postgres",
    threecx_password: t.threecx_password || "",
    threecx_chat_files_path: t.threecx_chat_files_path || "/var/lib/3cxpbx/Instance1/Data/Http/Files/Chat Files",
    threecx_recordings_path: t.threecx_recordings_path || "/var/lib/3cxpbx/Instance1/Data/Recordings",
    threecx_voicemail_path: t.threecx_voicemail_path || "/var/lib/3cxpbx/Instance1/Data/Voicemail",
    threecx_fax_path: t.threecx_fax_path || "/var/lib/3cxpbx/Instance1/Data/Fax",
    threecx_meetings_path: t.threecx_meetings_path || "/var/lib/3cxpbx/Instance1/Data/Http/Recordings",
    backup_chats: t.backup_chats ?? true,
    backup_chat_media: t.backup_chat_media ?? true,
    backup_recordings: t.backup_recordings ?? true,
    backup_voicemails: t.backup_voicemails ?? true,
    backup_faxes: t.backup_faxes ?? true,
    backup_cdr: t.backup_cdr ?? true,
    backup_meetings: t.backup_meetings ?? true,
    sync_enabled: t.sync_enabled ?? true,
    sync_interval_seconds: t.sync_interval_seconds || 60,
  }));
}

export async function updateTenantLastSync(tenantId: string): Promise<void> {
  const client = getSupabaseClient();

  const { error } = await client
    .from("tenants")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", tenantId);

  if (error) {
    logger.error("Failed to update tenant last sync", { error, tenantId });
  }
}
