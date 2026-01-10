import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../utils/logger";
import { SupabaseError } from "../utils/errors";

let supabase: SupabaseClient | null = null;

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
  is_external?: boolean;
  is_group_chat?: boolean;
  participant_count?: number;
  tenant_id?: string;
}): Promise<string> {
  const client = getSupabaseClient();

  const insertData: Record<string, unknown> = {
    threecx_conversation_id: conversation.threecx_conversation_id,
    conversation_name: conversation.conversation_name,
    is_external: conversation.is_external ?? false,
    is_group_chat: conversation.is_group_chat ?? false,
    participant_count: conversation.participant_count ?? 2,
  };

  if (conversation.tenant_id) {
    insertData.tenant_id = conversation.tenant_id;
  }

  const { data, error } = await client
    .from("conversations")
    .upsert(insertData, {
      onConflict: conversation.tenant_id
        ? "threecx_conversation_id,tenant_id"
        : "threecx_conversation_id"
    })
    .select("id")
    .single();

  if (error) {
    throw new SupabaseError("Failed to upsert conversation", { error });
  }

  return data.id;
}

// Upsert participant
export async function upsertParticipant(participant: {
  conversation_id: string;
  extension_number?: string | null;
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
  participant_type?: string;
}): Promise<void> {
  const client = getSupabaseClient();

  const { error } = await client.from("participants").upsert(
    {
      conversation_id: participant.conversation_id,
      extension_number: participant.extension_number,
      display_name: participant.display_name,
      email: participant.email,
      phone: participant.phone,
      participant_type: participant.participant_type || "extension",
    },
    { onConflict: "conversation_id,extension_number" }
  );

  if (error) {
    logger.warn("Failed to upsert participant", { error, participant });
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
}): Promise<string | null> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("messages")
    .upsert(
      {
        conversation_id: message.conversation_id,
        threecx_message_id: message.threecx_message_id,
        sender_extension: message.sender_extension,
        sender_name: message.sender_name,
        message_text: message.message_text,
        message_type: message.message_type || "text",
        has_media: message.has_media || false,
        sent_at: message.sent_at,
      },
      { onConflict: "threecx_message_id", ignoreDuplicates: true }
    )
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Duplicate - already exists
      return null;
    }
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

// Upsert extension
export async function upsertExtension(extension: {
  extension_number: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  email?: string | null;
  tenant_id?: string;
}): Promise<void> {
  const client = getSupabaseClient();

  const displayName =
    extension.display_name ||
    [extension.first_name, extension.last_name].filter(Boolean).join(" ") ||
    null;

  const insertData: Record<string, unknown> = {
    extension_number: extension.extension_number,
    first_name: extension.first_name,
    last_name: extension.last_name,
    display_name: displayName,
    email: extension.email,
    last_synced_at: new Date().toISOString(),
  };

  if (extension.tenant_id) {
    insertData.tenant_id = extension.tenant_id;
  }

  const { error } = await client.from("extensions").upsert(insertData, {
    onConflict: extension.tenant_id
      ? "extension_number,tenant_id"
      : "extension_number"
  });

  if (error) {
    logger.warn("Failed to upsert extension", { error, extension });
  }
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

// Update sync status
export async function updateSyncStatus(
  syncType: string,
  status: "idle" | "running" | "success" | "error",
  details?: {
    lastSyncedTimestamp?: string;
    lastSyncedMessageId?: string;
    recordsSynced?: number;
    errorMessage?: string;
    tenantId?: string;
  }
): Promise<void> {
  const client = getSupabaseClient();

  const update: Record<string, unknown> = {
    status,
    last_sync_at: new Date().toISOString(),
  };

  if (status === "success") {
    update.last_successful_sync_at = new Date().toISOString();
    update.error_message = null;
  }

  if (details?.lastSyncedTimestamp) {
    update.last_synced_timestamp = details.lastSyncedTimestamp;
  }
  if (details?.lastSyncedMessageId) {
    update.last_synced_message_id = details.lastSyncedMessageId;
  }
  if (details?.recordsSynced !== undefined) {
    update.records_synced = details.recordsSynced;
  }
  if (details?.errorMessage) {
    update.error_message = details.errorMessage;
  }

  let query = client
    .from("sync_status")
    .update(update)
    .eq("sync_type", syncType);

  if (details?.tenantId) {
    query = query.eq("tenant_id", details.tenantId);
  }

  const { error } = await query;

  if (error) {
    logger.error("Failed to update sync status", { error, syncType });
  }
}

// Get last synced timestamp
export async function getLastSyncedTimestamp(
  syncType: string,
  tenantId?: string
): Promise<Date | null> {
  const client = getSupabaseClient();

  let query = client
    .from("sync_status")
    .select("last_synced_timestamp")
    .eq("sync_type", syncType);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.single();

  if (error || !data?.last_synced_timestamp) {
    return null;
  }

  return new Date(data.last_synced_timestamp);
}

// Create sync log entry
export async function createSyncLog(log: {
  sync_type: string;
  started_at: string;
  completed_at?: string;
  status?: string;
  messages_synced?: number;
  media_synced?: number;
  errors_count?: number;
  error_details?: Record<string, unknown>;
  tenant_id?: string;
}): Promise<string> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("sync_logs")
    .insert(log)
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

  const { error } = await client
    .from("sync_logs")
    .update(updates)
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
  call_id?: string;
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
  call_started_at?: string;
  call_ended_at?: string;
  recorded_at: string;
}): Promise<string> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("call_recordings")
    .upsert(recording, {
      onConflict: "tenant_id,threecx_recording_id",
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
        .eq("threecx_recording_id", recording.threecx_recording_id)
        .single();
      return existing?.id || "";
    }
    throw new SupabaseError("Failed to insert call recording", { error });
  }

  return data?.id || "";
}

// ============================================
// VOICEMAILS
// ============================================

export async function insertVoicemail(voicemail: {
  tenant_id: string;
  threecx_voicemail_id?: string;
  extension: string;
  extension_name?: string;
  caller_number?: string;
  caller_name?: string;
  original_filename?: string;
  file_size: number;
  storage_path: string;
  mime_type?: string;
  duration_seconds?: number;
  is_read?: boolean;
  is_urgent?: boolean;
  transcription?: string;
  received_at: string;
}): Promise<string> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("voicemails")
    .upsert(voicemail, {
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

  const { data, error } = await client
    .from("call_logs")
    .upsert(callLog, {
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
}): Promise<string> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("media_files")
    .upsert(
      {
        tenant_id: media.tenant_id,
        message_id: media.message_id,
        conversation_id: media.conversation_id,
        original_filename: media.original_filename,
        stored_filename: media.stored_filename,
        file_type: media.file_type,
        mime_type: media.mime_type,
        file_size: media.file_size,
        storage_path: media.storage_path,
        thumbnail_path: media.thumbnail_path,
      },
      { onConflict: "tenant_id,storage_path" }
    )
    .select("id")
    .single();

  if (error) {
    throw new SupabaseError("Failed to insert media file", { error });
  }

  return data.id;
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
