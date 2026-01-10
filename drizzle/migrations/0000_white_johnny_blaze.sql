-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "user_tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" varchar(50) DEFAULT 'user' NOT NULL,
	"can_view_chats" boolean DEFAULT true,
	"can_view_recordings" boolean DEFAULT true,
	"can_view_voicemails" boolean DEFAULT true,
	"can_view_faxes" boolean DEFAULT true,
	"can_view_meetings" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"invited_by" uuid,
	CONSTRAINT "user_tenants_user_id_tenant_id_key" UNIQUE("user_id","tenant_id"),
	CONSTRAINT "user_tenants_role_check" CHECK ((role)::text = ANY ((ARRAY['admin'::character varying, 'user'::character varying])::text[]))
);
--> statement-breakpoint
ALTER TABLE "user_tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "tenant_settings_tenant_id_key_key" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "app_settings_key_key" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255),
	"avatar_url" text,
	"role" varchar(50) DEFAULT 'user' NOT NULL,
	"is_protected" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"last_login_at" timestamp with time zone,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_profiles_role_check" CHECK ((role)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'user'::character varying])::text[]))
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"threecx_chat_id" varchar(255),
	"subject" varchar(500),
	"channel_type" varchar(50) DEFAULT 'chat',
	"is_group" boolean DEFAULT false,
	"status" varchar(50) DEFAULT 'active',
	"message_count" integer DEFAULT 0,
	"last_message_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "conversations_tenant_id_threecx_chat_id_key" UNIQUE("tenant_id","threecx_chat_id")
);
--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"extension_id" uuid,
	"participant_type" varchar(50) DEFAULT 'internal',
	"external_id" varchar(255),
	"external_name" varchar(255),
	"external_number" varchar(50),
	"joined_at" timestamp with time zone DEFAULT now(),
	"left_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
ALTER TABLE "participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sender_participant_id" uuid,
	"threecx_message_id" varchar(255),
	"content" text,
	"message_type" varchar(50) DEFAULT 'text',
	"is_from_external" boolean DEFAULT false,
	"sent_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "media_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid,
	"tenant_id" uuid NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"file_type" varchar(100),
	"file_size" bigint,
	"mime_type" varchar(100),
	"storage_path" text NOT NULL,
	"thumbnail_path" text,
	"duration_seconds" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "media_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "call_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"threecx_call_id" varchar(255),
	"file_name" varchar(500) NOT NULL,
	"file_size" bigint,
	"duration_seconds" integer,
	"storage_path" text NOT NULL,
	"caller_number" varchar(50),
	"caller_name" varchar(255),
	"callee_number" varchar(50),
	"callee_name" varchar(255),
	"extension_id" uuid,
	"direction" varchar(20),
	"call_type" varchar(50),
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "call_recordings_tenant_id_threecx_call_id_key" UNIQUE("tenant_id","threecx_call_id")
);
--> statement-breakpoint
ALTER TABLE "call_recordings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "voicemails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"threecx_voicemail_id" varchar(255),
	"extension_id" uuid,
	"file_name" varchar(500) NOT NULL,
	"file_size" bigint,
	"duration_seconds" integer,
	"storage_path" text NOT NULL,
	"caller_number" varchar(50),
	"caller_name" varchar(255),
	"transcription" text,
	"is_read" boolean DEFAULT false,
	"received_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "voicemails_tenant_id_threecx_voicemail_id_key" UNIQUE("tenant_id","threecx_voicemail_id")
);
--> statement-breakpoint
ALTER TABLE "voicemails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "faxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"threecx_fax_id" varchar(255),
	"extension_id" uuid,
	"file_name" varchar(500) NOT NULL,
	"file_size" bigint,
	"page_count" integer,
	"storage_path" text NOT NULL,
	"direction" varchar(20),
	"remote_number" varchar(50),
	"remote_name" varchar(255),
	"status" varchar(50),
	"sent_received_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "faxes_tenant_id_threecx_fax_id_key" UNIQUE("tenant_id","threecx_fax_id")
);
--> statement-breakpoint
ALTER TABLE "faxes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "call_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"threecx_call_id" varchar(255),
	"extension_id" uuid,
	"caller_number" varchar(50),
	"caller_name" varchar(255),
	"callee_number" varchar(50),
	"callee_name" varchar(255),
	"direction" varchar(20),
	"call_type" varchar(50),
	"status" varchar(50),
	"duration_seconds" integer,
	"ring_duration_seconds" integer,
	"queue_wait_seconds" integer,
	"started_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"recording_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "call_logs_tenant_id_threecx_call_id_key" UNIQUE("tenant_id","threecx_call_id")
);
--> statement-breakpoint
ALTER TABLE "call_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meeting_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"threecx_meeting_id" varchar(255),
	"title" varchar(500),
	"file_name" varchar(500) NOT NULL,
	"file_size" bigint,
	"duration_seconds" integer,
	"storage_path" text NOT NULL,
	"organizer_extension_id" uuid,
	"organizer_name" varchar(255),
	"organizer_email" varchar(255),
	"participant_count" integer DEFAULT 0,
	"participants" jsonb DEFAULT '[]'::jsonb,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"meeting_type" varchar(50) DEFAULT 'scheduled',
	"is_recurring" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "meeting_recordings_tenant_id_threecx_meeting_id_key" UNIQUE("tenant_id","threecx_meeting_id")
);
--> statement-breakpoint
ALTER TABLE "meeting_recordings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"extension_number" varchar(20) NOT NULL,
	"display_name" varchar(255),
	"email" varchar(255),
	"department" varchar(100),
	"is_active" boolean DEFAULT true,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "extensions_tenant_id_extension_number_key" UNIQUE("tenant_id","extension_number")
);
--> statement-breakpoint
ALTER TABLE "extensions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sync_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"sync_type" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'idle' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_successful_sync_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone,
	"items_synced" integer DEFAULT 0,
	"items_failed" integer DEFAULT 0,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "sync_status" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"sync_type" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"items_processed" integer DEFAULT 0,
	"items_created" integer DEFAULT 0,
	"items_updated" integer DEFAULT 0,
	"items_failed" integer DEFAULT 0,
	"error_details" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
ALTER TABLE "sync_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storage_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"date" date DEFAULT CURRENT_DATE NOT NULL,
	"chat_media_bytes" bigint DEFAULT 0,
	"recordings_bytes" bigint DEFAULT 0,
	"voicemails_bytes" bigint DEFAULT 0,
	"faxes_bytes" bigint DEFAULT 0,
	"meetings_bytes" bigint DEFAULT 0,
	"total_bytes" bigint DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "storage_usage_tenant_id_date_key" UNIQUE("tenant_id","date")
);
--> statement-breakpoint
ALTER TABLE "storage_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"tenant_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"old_values" jsonb,
	"new_values" jsonb,
	"ip_address" varchar(50),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"logo_url" text,
	"is_active" boolean DEFAULT true,
	"storage_quota_bytes" bigint DEFAULT '10737418240',
	"storage_used_bytes" bigint DEFAULT 0,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by" uuid,
	"threecx_host" varchar(255),
	"threecx_port" integer DEFAULT 5432,
	"threecx_database" varchar(100) DEFAULT 'database_single',
	"threecx_user" varchar(100) DEFAULT 'postgres',
	"threecx_password" text,
	"threecx_chat_files_path" varchar(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Http/Files/Chat Files',
	"threecx_recordings_path" varchar(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Recordings',
	"threecx_voicemail_path" varchar(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Voicemail',
	"threecx_fax_path" varchar(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Fax',
	"threecx_meetings_path" varchar(500) DEFAULT '/var/lib/3cxpbx/Instance1/Data/Http/Recordings',
	"backup_chats" boolean DEFAULT true,
	"backup_chat_media" boolean DEFAULT true,
	"backup_recordings" boolean DEFAULT true,
	"backup_voicemails" boolean DEFAULT true,
	"backup_faxes" boolean DEFAULT true,
	"backup_cdr" boolean DEFAULT true,
	"backup_meetings" boolean DEFAULT true,
	"sync_enabled" boolean DEFAULT true,
	"sync_interval_seconds" integer DEFAULT 60,
	"last_sync_at" timestamp with time zone,
	CONSTRAINT "tenants_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "public"."extensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_participant_id_fkey" FOREIGN KEY ("sender_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "public"."extensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voicemails" ADD CONSTRAINT "voicemails_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "public"."extensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voicemails" ADD CONSTRAINT "voicemails_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faxes" ADD CONSTRAINT "faxes_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "public"."extensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faxes" ADD CONSTRAINT "faxes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "public"."extensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "public"."call_recordings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_recordings" ADD CONSTRAINT "meeting_recordings_organizer_extension_id_fkey" FOREIGN KEY ("organizer_extension_id") REFERENCES "public"."extensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_recordings" ADD CONSTRAINT "meeting_recordings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extensions" ADD CONSTRAINT "extensions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_status" ADD CONSTRAINT "sync_status_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_usage" ADD CONSTRAINT "storage_usage_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_tenants_tenant" ON "user_tenants" USING btree ("tenant_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_tenants_user" ON "user_tenants" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_profiles_email" ON "user_profiles" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_profiles_role" ON "user_profiles" USING btree ("role" text_ops);--> statement-breakpoint
CREATE INDEX "idx_conversations_last_message" ON "conversations" USING btree ("last_message_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_conversations_tenant" ON "conversations" USING btree ("tenant_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_conversations_threecx_id" ON "conversations" USING btree ("threecx_chat_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_participants_conversation" ON "participants" USING btree ("conversation_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_participants_extension" ON "participants" USING btree ("extension_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_conversation" ON "messages" USING btree ("conversation_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_sent_at" ON "messages" USING btree ("sent_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_tenant" ON "messages" USING btree ("tenant_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_threecx_id" ON "messages" USING btree ("threecx_message_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_media_files_message" ON "media_files" USING btree ("message_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_media_files_tenant" ON "media_files" USING btree ("tenant_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_call_recordings_extension" ON "call_recordings" USING btree ("extension_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_call_recordings_started" ON "call_recordings" USING btree ("started_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_call_recordings_tenant" ON "call_recordings" USING btree ("tenant_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_voicemails_extension" ON "voicemails" USING btree ("extension_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_voicemails_received" ON "voicemails" USING btree ("received_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_voicemails_tenant" ON "voicemails" USING btree ("tenant_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_faxes_date" ON "faxes" USING btree ("sent_received_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_faxes_extension" ON "faxes" USING btree ("extension_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_faxes_tenant" ON "faxes" USING btree ("tenant_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_call_logs_extension" ON "call_logs" USING btree ("extension_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_call_logs_started" ON "call_logs" USING btree ("started_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_call_logs_tenant" ON "call_logs" USING btree ("tenant_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_meeting_recordings_organizer" ON "meeting_recordings" USING btree ("organizer_extension_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_meeting_recordings_started" ON "meeting_recordings" USING btree ("started_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_meeting_recordings_tenant" ON "meeting_recordings" USING btree ("tenant_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_extensions_number" ON "extensions" USING btree ("extension_number" text_ops);--> statement-breakpoint
CREATE INDEX "idx_extensions_tenant" ON "extensions" USING btree ("tenant_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_sync_status_tenant" ON "sync_status" USING btree ("tenant_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_sync_status_type" ON "sync_status" USING btree ("sync_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_sync_logs_started" ON "sync_logs" USING btree ("started_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_sync_logs_tenant" ON "sync_logs" USING btree ("tenant_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_storage_usage_tenant_date" ON "storage_usage" USING btree ("tenant_id" date_ops,"date" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created" ON "audit_logs" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_tenant" ON "audit_logs" USING btree ("tenant_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_user" ON "audit_logs" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_tenants_active" ON "tenants" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_tenants_slug" ON "tenants" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE VIEW "public"."tenant_storage_usage" AS (SELECT t.id AS tenant_id, t.name AS tenant_name, t.storage_quota_bytes, t.storage_used_bytes, COALESCE(sum(mf.file_size), 0::numeric) AS chat_media_bytes, COALESCE(sum(cr.file_size), 0::numeric) AS recordings_bytes, COALESCE(sum(vm.file_size), 0::numeric) AS voicemails_bytes, COALESCE(sum(fx.file_size), 0::numeric) AS faxes_bytes, COALESCE(sum(mr.file_size), 0::numeric) AS meetings_bytes, count(DISTINCT mf.id) AS media_files_count, count(DISTINCT cr.id) AS recordings_count, count(DISTINCT vm.id) AS voicemails_count, count(DISTINCT fx.id) AS faxes_count, count(DISTINCT mr.id) AS meetings_count FROM tenants t LEFT JOIN media_files mf ON mf.tenant_id = t.id LEFT JOIN call_recordings cr ON cr.tenant_id = t.id LEFT JOIN voicemails vm ON vm.tenant_id = t.id LEFT JOIN faxes fx ON fx.tenant_id = t.id LEFT JOIN meeting_recordings mr ON mr.tenant_id = t.id GROUP BY t.id);--> statement-breakpoint
CREATE POLICY "Super admins can manage all user_tenants" ON "user_tenants" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_super_admin()) WITH CHECK (is_super_admin());--> statement-breakpoint
CREATE POLICY "Users can view own tenant associations" ON "user_tenants" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role full access user_tenants" ON "user_tenants" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Super admins can manage all tenant settings" ON "tenant_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_super_admin()) WITH CHECK (is_super_admin());--> statement-breakpoint
CREATE POLICY "Tenant admins can manage their settings" ON "tenant_settings" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role full access tenant_settings" ON "tenant_settings" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Super admins can manage app settings" ON "app_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_super_admin()) WITH CHECK (is_super_admin());--> statement-breakpoint
CREATE POLICY "Authenticated users can view app settings" ON "app_settings" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role full access app_settings" ON "app_settings" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Users can view own profile" ON "user_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Users can update own profile" ON "user_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role full access user_profiles" ON "user_profiles" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Users can view tenant conversations" ON "conversations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids)));--> statement-breakpoint
CREATE POLICY "Service role full access conversations" ON "conversations" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Users can view tenant participants" ON "participants" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((conversation_id IN ( SELECT conversations.id
   FROM conversations
  WHERE (conversations.tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids)))));--> statement-breakpoint
CREATE POLICY "Service role full access participants" ON "participants" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Users can view tenant messages" ON "messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids)));--> statement-breakpoint
CREATE POLICY "Service role full access messages" ON "messages" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Users can view tenant media" ON "media_files" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids)));--> statement-breakpoint
CREATE POLICY "Service role full access media_files" ON "media_files" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Users can view tenant recordings" ON "call_recordings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids)));--> statement-breakpoint
CREATE POLICY "Service role full access call_recordings" ON "call_recordings" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Users can view tenant voicemails" ON "voicemails" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids)));--> statement-breakpoint
CREATE POLICY "Service role full access voicemails" ON "voicemails" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Users can view tenant faxes" ON "faxes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids)));--> statement-breakpoint
CREATE POLICY "Service role full access faxes" ON "faxes" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Users can view tenant call logs" ON "call_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids)));--> statement-breakpoint
CREATE POLICY "Service role full access call_logs" ON "call_logs" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Users can view tenant meetings" ON "meeting_recordings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids)));--> statement-breakpoint
CREATE POLICY "Service role full access meeting_recordings" ON "meeting_recordings" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Users can view tenant extensions" ON "extensions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids)));--> statement-breakpoint
CREATE POLICY "Service role full access extensions" ON "extensions" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Super admins can manage sync status" ON "sync_status" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_super_admin()) WITH CHECK (is_super_admin());--> statement-breakpoint
CREATE POLICY "Users can view sync status" ON "sync_status" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role full access sync_status" ON "sync_status" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Super admins can manage sync logs" ON "sync_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_super_admin()) WITH CHECK (is_super_admin());--> statement-breakpoint
CREATE POLICY "Users can view sync logs" ON "sync_logs" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role full access sync_logs" ON "sync_logs" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Users can view storage usage" ON "storage_usage" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids)));--> statement-breakpoint
CREATE POLICY "Service role full access storage_usage" ON "storage_usage" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Super admins can view all audit logs" ON "audit_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_super_admin());--> statement-breakpoint
CREATE POLICY "Users can view own audit logs" ON "audit_logs" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role full access audit_logs" ON "audit_logs" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Super admins can manage all tenants" ON "tenants" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_super_admin()) WITH CHECK (is_super_admin());--> statement-breakpoint
CREATE POLICY "Users can view their tenants" ON "tenants" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role full access tenants" ON "tenants" AS PERMISSIVE FOR ALL TO "service_role";
*/