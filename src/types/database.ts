// Supabase database types - generated from schema
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      conversations: {
        Row: {
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
        };
        Insert: {
          id?: string;
          threecx_conversation_id: string;
          conversation_name?: string | null;
          is_external?: boolean;
          is_group_chat?: boolean;
          participant_count?: number;
          first_message_at?: string | null;
          last_message_at?: string | null;
          message_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          threecx_conversation_id?: string;
          conversation_name?: string | null;
          is_external?: boolean;
          is_group_chat?: boolean;
          participant_count?: number;
          first_message_at?: string | null;
          last_message_at?: string | null;
          message_count?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      participants: {
        Row: {
          id: string;
          conversation_id: string;
          extension_number: string | null;
          display_name: string | null;
          email: string | null;
          phone: string | null;
          participant_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          extension_number?: string | null;
          display_name?: string | null;
          email?: string | null;
          phone?: string | null;
          participant_type?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          extension_number?: string | null;
          display_name?: string | null;
          email?: string | null;
          phone?: string | null;
          participant_type?: string;
          created_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          threecx_message_id: string | null;
          sender_extension: string | null;
          sender_name: string | null;
          message_text: string | null;
          message_type: string;
          has_media: boolean;
          sent_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          threecx_message_id?: string | null;
          sender_extension?: string | null;
          sender_name?: string | null;
          message_text?: string | null;
          message_type?: string;
          has_media?: boolean;
          sent_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          threecx_message_id?: string | null;
          sender_extension?: string | null;
          sender_name?: string | null;
          message_text?: string | null;
          message_type?: string;
          has_media?: boolean;
          sent_at?: string;
          created_at?: string;
        };
      };
      media_files: {
        Row: {
          id: string;
          message_id: string | null;
          conversation_id: string | null;
          original_filename: string | null;
          stored_filename: string | null;
          file_type: string;
          mime_type: string | null;
          file_size_bytes: number | null;
          s3_key: string;
          s3_bucket: string;
          thumbnail_s3_key: string | null;
          width: number | null;
          height: number | null;
          duration_seconds: number | null;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          message_id?: string | null;
          conversation_id?: string | null;
          original_filename?: string | null;
          stored_filename?: string | null;
          file_type?: string;
          mime_type?: string | null;
          file_size_bytes?: number | null;
          s3_key: string;
          s3_bucket: string;
          thumbnail_s3_key?: string | null;
          width?: number | null;
          height?: number | null;
          duration_seconds?: number | null;
          uploaded_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string | null;
          conversation_id?: string | null;
          original_filename?: string | null;
          stored_filename?: string | null;
          file_type?: string;
          mime_type?: string | null;
          file_size_bytes?: number | null;
          s3_key?: string;
          s3_bucket?: string;
          thumbnail_s3_key?: string | null;
          width?: number | null;
          height?: number | null;
          duration_seconds?: number | null;
          uploaded_at?: string;
        };
      };
      extensions: {
        Row: {
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
        };
        Insert: {
          id?: string;
          extension_number: string;
          first_name?: string | null;
          last_name?: string | null;
          display_name?: string | null;
          email?: string | null;
          is_active?: boolean;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          extension_number?: string;
          first_name?: string | null;
          last_name?: string | null;
          display_name?: string | null;
          email?: string | null;
          is_active?: boolean;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      sync_status: {
        Row: {
          id: string;
          sync_type: string;
          last_sync_at: string | null;
          last_successful_sync_at: string | null;
          last_synced_message_id: string | null;
          last_synced_timestamp: string | null;
          records_synced: number;
          status: string;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sync_type: string;
          last_sync_at?: string | null;
          last_successful_sync_at?: string | null;
          last_synced_message_id?: string | null;
          last_synced_timestamp?: string | null;
          records_synced?: number;
          status?: string;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sync_type?: string;
          last_sync_at?: string | null;
          last_successful_sync_at?: string | null;
          last_synced_message_id?: string | null;
          last_synced_timestamp?: string | null;
          records_synced?: number;
          status?: string;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      sync_logs: {
        Row: {
          id: string;
          sync_type: string;
          started_at: string;
          completed_at: string | null;
          status: string | null;
          messages_synced: number;
          media_synced: number;
          errors_count: number;
          error_details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sync_type: string;
          started_at: string;
          completed_at?: string | null;
          status?: string | null;
          messages_synced?: number;
          media_synced?: number;
          errors_count?: number;
          error_details?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sync_type?: string;
          started_at?: string;
          completed_at?: string | null;
          status?: string | null;
          messages_synced?: number;
          media_synced?: number;
          errors_count?: number;
          error_details?: Json | null;
          created_at?: string;
        };
      };
    };
  };
}
