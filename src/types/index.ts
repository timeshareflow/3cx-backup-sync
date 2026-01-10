// Database types
export interface Conversation {
  id: string;
  threecx_conversation_id: string;
  conversation_name: string | null;
  is_external: boolean;
  is_group_chat: boolean;
  participant_count: number;
  first_message_at: string | null;
  last_message_at: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface Participant {
  id: string;
  conversation_id: string;
  extension_number: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  participant_type: "extension" | "external" | "queue";
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  threecx_message_id: string | null;
  sender_extension: string | null;
  sender_name: string | null;
  message_text: string | null;
  message_type: "text" | "image" | "video" | "file";
  has_media: boolean;
  sent_at: string;
  created_at: string;
  media_files?: MediaFile[];
}

export interface MediaFile {
  id: string;
  message_id: string | null;
  conversation_id: string | null;
  original_filename: string | null;
  stored_filename: string | null;
  file_type: "image" | "video" | "document";
  mime_type: string | null;
  file_size_bytes: number | null;
  s3_key: string;
  s3_bucket: string;
  thumbnail_s3_key: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  uploaded_at: string;
}

export interface Extension {
  id: string;
  extension_number: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncStatus {
  id: string;
  sync_type: "messages" | "media" | "extensions";
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_synced_message_id: string | null;
  last_synced_timestamp: string | null;
  records_synced: number;
  status: "idle" | "running" | "success" | "error";
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: string;
  sync_type: string;
  started_at: string;
  completed_at: string | null;
  status: "success" | "error" | "partial" | null;
  messages_synced: number;
  media_synced: number;
  errors_count: number;
  error_details: Record<string, unknown> | null;
  created_at: string;
}

// API types
export interface ConversationWithParticipants extends Conversation {
  participants: Participant[];
}

export interface MessageWithMedia extends Message {
  media_files: MediaFile[];
}

export interface SearchResult {
  messages: MessageWithMedia[];
  total_count: number;
  has_more: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

// 3CX source types
export interface ThreeCXMessage {
  message_id: string;
  conversation_id: string;
  is_external: boolean;
  queue_number: string | null;
  sender_participant_ip: string | null;
  sender_participant_name: string | null;
  sender_participant_no: string | null;
  sender_participant_phone: string | null;
  time_sent: string;
  message: string | null;
}

export interface ThreeCXConversation {
  conversation_id: string;
  is_external: boolean;
  queue_number: string | null;
  from_no: string | null;
  from_name: string | null;
  provider_name: string | null;
  participant_ip: string | null;
  participant_phone: string | null;
  participant_email: string | null;
  time_sent: string;
  message: string | null;
  chat_name: string | null;
  participants_grp_array: string | null;
  provider_type: string | null;
}

export interface ThreeCXExtension {
  idextension: number;
  extension_number: string;
  firstname: string | null;
  lastname: string | null;
  phone_public: string | null;
}
