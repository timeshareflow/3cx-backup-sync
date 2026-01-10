import { pgTable, index, foreignKey, unique, pgPolicy, check, uuid, varchar, boolean, timestamp, jsonb, text, integer, bigint, date, pgView, numeric } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const userTenants = pgTable("user_tenants", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	tenantId: uuid("tenant_id").notNull(),
	role: varchar({ length: 50 }).default('user').notNull(),
	canViewChats: boolean("can_view_chats").default(true),
	canViewRecordings: boolean("can_view_recordings").default(true),
	canViewVoicemails: boolean("can_view_voicemails").default(true),
	canViewFaxes: boolean("can_view_faxes").default(true),
	canViewMeetings: boolean("can_view_meetings").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	invitedBy: uuid("invited_by"),
}, (table) => [
	index("idx_user_tenants_tenant").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_tenants_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.invitedBy],
			foreignColumns: [users.id],
			name: "user_tenants_invited_by_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "user_tenants_tenant_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [userProfiles.id],
			name: "user_tenants_user_id_fkey"
		}).onDelete("cascade"),
	unique("user_tenants_user_id_tenant_id_key").on(table.userId, table.tenantId),
	pgPolicy("Super admins can manage all user_tenants", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_super_admin()`, withCheck: sql`is_super_admin()`  }),
	pgPolicy("Users can view own tenant associations", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("Service role full access user_tenants", { as: "permissive", for: "all", to: ["service_role"] }),
	check("user_tenants_role_check", sql`(role)::text = ANY ((ARRAY['admin'::character varying, 'user'::character varying])::text[])`),
]);

export const tenantSettings = pgTable("tenant_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	key: varchar({ length: 100 }).notNull(),
	value: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "tenant_settings_tenant_id_fkey"
		}).onDelete("cascade"),
	unique("tenant_settings_tenant_id_key_key").on(table.tenantId, table.key),
	pgPolicy("Super admins can manage all tenant settings", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_super_admin()`, withCheck: sql`is_super_admin()`  }),
	pgPolicy("Tenant admins can manage their settings", { as: "permissive", for: "all", to: ["authenticated"] }),
	pgPolicy("Service role full access tenant_settings", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const appSettings = pgTable("app_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	key: varchar({ length: 100 }).notNull(),
	value: jsonb().default({}).notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("app_settings_key_key").on(table.key),
	pgPolicy("Super admins can manage app settings", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_super_admin()`, withCheck: sql`is_super_admin()`  }),
	pgPolicy("Authenticated users can view app settings", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("Service role full access app_settings", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const userProfiles = pgTable("user_profiles", {
	id: uuid().primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	fullName: varchar("full_name", { length: 255 }),
	avatarUrl: text("avatar_url"),
	role: varchar({ length: 50 }).default('user').notNull(),
	isProtected: boolean("is_protected").default(false),
	isActive: boolean("is_active").default(true),
	lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: 'string' }),
	preferences: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_user_profiles_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("idx_user_profiles_role").using("btree", table.role.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.id],
			foreignColumns: [users.id],
			name: "user_profiles_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can view own profile", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(id = auth.uid())` }),
	pgPolicy("Users can update own profile", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Service role full access user_profiles", { as: "permissive", for: "all", to: ["service_role"] }),
	check("user_profiles_role_check", sql`(role)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'user'::character varying])::text[])`),
]);

export const conversations = pgTable("conversations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	threecxChatId: varchar("threecx_chat_id", { length: 255 }),
	subject: varchar({ length: 500 }),
	channelType: varchar("channel_type", { length: 50 }).default('chat'),
	isGroup: boolean("is_group").default(false),
	status: varchar({ length: 50 }).default('active'),
	messageCount: integer("message_count").default(0),
	lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: 'string' }),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_conversations_last_message").using("btree", table.lastMessageAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_conversations_tenant").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	index("idx_conversations_threecx_id").using("btree", table.threecxChatId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "conversations_tenant_id_fkey"
		}).onDelete("cascade"),
	unique("conversations_tenant_id_threecx_chat_id_key").on(table.tenantId, table.threecxChatId),
	pgPolicy("Users can view tenant conversations", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids))` }),
	pgPolicy("Service role full access conversations", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const participants = pgTable("participants", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	conversationId: uuid("conversation_id").notNull(),
	extensionId: uuid("extension_id"),
	participantType: varchar("participant_type", { length: 50 }).default('internal'),
	externalId: varchar("external_id", { length: 255 }),
	externalName: varchar("external_name", { length: 255 }),
	externalNumber: varchar("external_number", { length: 50 }),
	joinedAt: timestamp("joined_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	leftAt: timestamp("left_at", { withTimezone: true, mode: 'string' }),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_participants_conversation").using("btree", table.conversationId.asc().nullsLast().op("uuid_ops")),
	index("idx_participants_extension").using("btree", table.extensionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "participants_conversation_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.extensionId],
			foreignColumns: [extensions.id],
			name: "participants_extension_id_fkey"
		}),
	pgPolicy("Users can view tenant participants", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(conversation_id IN ( SELECT conversations.id
   FROM conversations
  WHERE (conversations.tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids))))` }),
	pgPolicy("Service role full access participants", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const messages = pgTable("messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	conversationId: uuid("conversation_id").notNull(),
	tenantId: uuid("tenant_id").notNull(),
	senderParticipantId: uuid("sender_participant_id"),
	threecxMessageId: varchar("threecx_message_id", { length: 255 }),
	content: text(),
	messageType: varchar("message_type", { length: 50 }).default('text'),
	isFromExternal: boolean("is_from_external").default(false),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }).notNull(),
	deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: 'string' }),
	readAt: timestamp("read_at", { withTimezone: true, mode: 'string' }),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_messages_conversation").using("btree", table.conversationId.asc().nullsLast().op("uuid_ops")),
	index("idx_messages_sent_at").using("btree", table.sentAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_messages_tenant").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	index("idx_messages_threecx_id").using("btree", table.threecxMessageId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "messages_conversation_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.senderParticipantId],
			foreignColumns: [participants.id],
			name: "messages_sender_participant_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "messages_tenant_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can view tenant messages", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids))` }),
	pgPolicy("Service role full access messages", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const mediaFiles = pgTable("media_files", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	messageId: uuid("message_id"),
	tenantId: uuid("tenant_id").notNull(),
	fileName: varchar("file_name", { length: 500 }).notNull(),
	fileType: varchar("file_type", { length: 100 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }),
	mimeType: varchar("mime_type", { length: 100 }),
	storagePath: text("storage_path").notNull(),
	thumbnailPath: text("thumbnail_path"),
	durationSeconds: integer("duration_seconds"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_media_files_message").using("btree", table.messageId.asc().nullsLast().op("uuid_ops")),
	index("idx_media_files_tenant").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.messageId],
			foreignColumns: [messages.id],
			name: "media_files_message_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "media_files_tenant_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can view tenant media", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids))` }),
	pgPolicy("Service role full access media_files", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const callRecordings = pgTable("call_recordings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	threecxCallId: varchar("threecx_call_id", { length: 255 }),
	fileName: varchar("file_name", { length: 500 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }),
	durationSeconds: integer("duration_seconds"),
	storagePath: text("storage_path").notNull(),
	callerNumber: varchar("caller_number", { length: 50 }),
	callerName: varchar("caller_name", { length: 255 }),
	calleeNumber: varchar("callee_number", { length: 50 }),
	calleeName: varchar("callee_name", { length: 255 }),
	extensionId: uuid("extension_id"),
	direction: varchar({ length: 20 }),
	callType: varchar("call_type", { length: 50 }),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).notNull(),
	endedAt: timestamp("ended_at", { withTimezone: true, mode: 'string' }),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_call_recordings_extension").using("btree", table.extensionId.asc().nullsLast().op("uuid_ops")),
	index("idx_call_recordings_started").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_call_recordings_tenant").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.extensionId],
			foreignColumns: [extensions.id],
			name: "call_recordings_extension_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "call_recordings_tenant_id_fkey"
		}).onDelete("cascade"),
	unique("call_recordings_tenant_id_threecx_call_id_key").on(table.tenantId, table.threecxCallId),
	pgPolicy("Users can view tenant recordings", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids))` }),
	pgPolicy("Service role full access call_recordings", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const voicemails = pgTable("voicemails", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	threecxVoicemailId: varchar("threecx_voicemail_id", { length: 255 }),
	extensionId: uuid("extension_id"),
	fileName: varchar("file_name", { length: 500 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }),
	durationSeconds: integer("duration_seconds"),
	storagePath: text("storage_path").notNull(),
	callerNumber: varchar("caller_number", { length: 50 }),
	callerName: varchar("caller_name", { length: 255 }),
	transcription: text(),
	isRead: boolean("is_read").default(false),
	receivedAt: timestamp("received_at", { withTimezone: true, mode: 'string' }).notNull(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_voicemails_extension").using("btree", table.extensionId.asc().nullsLast().op("uuid_ops")),
	index("idx_voicemails_received").using("btree", table.receivedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_voicemails_tenant").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.extensionId],
			foreignColumns: [extensions.id],
			name: "voicemails_extension_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "voicemails_tenant_id_fkey"
		}).onDelete("cascade"),
	unique("voicemails_tenant_id_threecx_voicemail_id_key").on(table.tenantId, table.threecxVoicemailId),
	pgPolicy("Users can view tenant voicemails", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids))` }),
	pgPolicy("Service role full access voicemails", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const faxes = pgTable("faxes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	threecxFaxId: varchar("threecx_fax_id", { length: 255 }),
	extensionId: uuid("extension_id"),
	fileName: varchar("file_name", { length: 500 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }),
	pageCount: integer("page_count"),
	storagePath: text("storage_path").notNull(),
	direction: varchar({ length: 20 }),
	remoteNumber: varchar("remote_number", { length: 50 }),
	remoteName: varchar("remote_name", { length: 255 }),
	status: varchar({ length: 50 }),
	sentReceivedAt: timestamp("sent_received_at", { withTimezone: true, mode: 'string' }).notNull(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_faxes_date").using("btree", table.sentReceivedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_faxes_extension").using("btree", table.extensionId.asc().nullsLast().op("uuid_ops")),
	index("idx_faxes_tenant").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.extensionId],
			foreignColumns: [extensions.id],
			name: "faxes_extension_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "faxes_tenant_id_fkey"
		}).onDelete("cascade"),
	unique("faxes_tenant_id_threecx_fax_id_key").on(table.tenantId, table.threecxFaxId),
	pgPolicy("Users can view tenant faxes", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids))` }),
	pgPolicy("Service role full access faxes", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const callLogs = pgTable("call_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	threecxCallId: varchar("threecx_call_id", { length: 255 }),
	extensionId: uuid("extension_id"),
	callerNumber: varchar("caller_number", { length: 50 }),
	callerName: varchar("caller_name", { length: 255 }),
	calleeNumber: varchar("callee_number", { length: 50 }),
	calleeName: varchar("callee_name", { length: 255 }),
	direction: varchar({ length: 20 }),
	callType: varchar("call_type", { length: 50 }),
	status: varchar({ length: 50 }),
	durationSeconds: integer("duration_seconds"),
	ringDurationSeconds: integer("ring_duration_seconds"),
	queueWaitSeconds: integer("queue_wait_seconds"),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).notNull(),
	answeredAt: timestamp("answered_at", { withTimezone: true, mode: 'string' }),
	endedAt: timestamp("ended_at", { withTimezone: true, mode: 'string' }),
	recordingId: uuid("recording_id"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_call_logs_extension").using("btree", table.extensionId.asc().nullsLast().op("uuid_ops")),
	index("idx_call_logs_started").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_call_logs_tenant").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.extensionId],
			foreignColumns: [extensions.id],
			name: "call_logs_extension_id_fkey"
		}),
	foreignKey({
			columns: [table.recordingId],
			foreignColumns: [callRecordings.id],
			name: "call_logs_recording_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "call_logs_tenant_id_fkey"
		}).onDelete("cascade"),
	unique("call_logs_tenant_id_threecx_call_id_key").on(table.tenantId, table.threecxCallId),
	pgPolicy("Users can view tenant call logs", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids))` }),
	pgPolicy("Service role full access call_logs", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const meetingRecordings = pgTable("meeting_recordings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	threecxMeetingId: varchar("threecx_meeting_id", { length: 255 }),
	title: varchar({ length: 500 }),
	fileName: varchar("file_name", { length: 500 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }),
	durationSeconds: integer("duration_seconds"),
	storagePath: text("storage_path").notNull(),
	organizerExtensionId: uuid("organizer_extension_id"),
	organizerName: varchar("organizer_name", { length: 255 }),
	organizerEmail: varchar("organizer_email", { length: 255 }),
	participantCount: integer("participant_count").default(0),
	participants: jsonb().default([]),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).notNull(),
	endedAt: timestamp("ended_at", { withTimezone: true, mode: 'string' }),
	meetingType: varchar("meeting_type", { length: 50 }).default('scheduled'),
	isRecurring: boolean("is_recurring").default(false),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_meeting_recordings_organizer").using("btree", table.organizerExtensionId.asc().nullsLast().op("uuid_ops")),
	index("idx_meeting_recordings_started").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_meeting_recordings_tenant").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.organizerExtensionId],
			foreignColumns: [extensions.id],
			name: "meeting_recordings_organizer_extension_id_fkey"
		}),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "meeting_recordings_tenant_id_fkey"
		}).onDelete("cascade"),
	unique("meeting_recordings_tenant_id_threecx_meeting_id_key").on(table.tenantId, table.threecxMeetingId),
	pgPolicy("Users can view tenant meetings", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids))` }),
	pgPolicy("Service role full access meeting_recordings", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const extensions = pgTable("extensions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	extensionNumber: varchar("extension_number", { length: 20 }).notNull(),
	displayName: varchar("display_name", { length: 255 }),
	email: varchar({ length: 255 }),
	department: varchar({ length: 100 }),
	isActive: boolean("is_active").default(true),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_extensions_number").using("btree", table.extensionNumber.asc().nullsLast().op("text_ops")),
	index("idx_extensions_tenant").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "extensions_tenant_id_fkey"
		}).onDelete("cascade"),
	unique("extensions_tenant_id_extension_number_key").on(table.tenantId, table.extensionNumber),
	pgPolicy("Users can view tenant extensions", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids))` }),
	pgPolicy("Service role full access extensions", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const syncStatus = pgTable("sync_status", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id"),
	syncType: varchar("sync_type", { length: 50 }).notNull(),
	status: varchar({ length: 50 }).default('idle').notNull(),
	lastSyncAt: timestamp("last_sync_at", { withTimezone: true, mode: 'string' }),
	lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true, mode: 'string' }),
	nextSyncAt: timestamp("next_sync_at", { withTimezone: true, mode: 'string' }),
	itemsSynced: integer("items_synced").default(0),
	itemsFailed: integer("items_failed").default(0),
	errorMessage: text("error_message"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_sync_status_tenant").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	index("idx_sync_status_type").using("btree", table.syncType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "sync_status_tenant_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Super admins can manage sync status", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_super_admin()`, withCheck: sql`is_super_admin()`  }),
	pgPolicy("Users can view sync status", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("Service role full access sync_status", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const syncLogs = pgTable("sync_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id"),
	syncType: varchar("sync_type", { length: 50 }).notNull(),
	status: varchar({ length: 50 }).notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	itemsProcessed: integer("items_processed").default(0),
	itemsCreated: integer("items_created").default(0),
	itemsUpdated: integer("items_updated").default(0),
	itemsFailed: integer("items_failed").default(0),
	errorDetails: jsonb("error_details"),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_sync_logs_started").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_sync_logs_tenant").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "sync_logs_tenant_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Super admins can manage sync logs", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_super_admin()`, withCheck: sql`is_super_admin()`  }),
	pgPolicy("Users can view sync logs", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("Service role full access sync_logs", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const storageUsage = pgTable("storage_usage", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	date: date().default(sql`CURRENT_DATE`).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	chatMediaBytes: bigint("chat_media_bytes", { mode: "number" }).default(0),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	recordingsBytes: bigint("recordings_bytes", { mode: "number" }).default(0),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	voicemailsBytes: bigint("voicemails_bytes", { mode: "number" }).default(0),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	faxesBytes: bigint("faxes_bytes", { mode: "number" }).default(0),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	meetingsBytes: bigint("meetings_bytes", { mode: "number" }).default(0),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalBytes: bigint("total_bytes", { mode: "number" }).default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_storage_usage_tenant_date").using("btree", table.tenantId.asc().nullsLast().op("date_ops"), table.date.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "storage_usage_tenant_id_fkey"
		}).onDelete("cascade"),
	unique("storage_usage_tenant_id_date_key").on(table.tenantId, table.date),
	pgPolicy("Users can view storage usage", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids))` }),
	pgPolicy("Service role full access storage_usage", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const auditLogs = pgTable("audit_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	tenantId: uuid("tenant_id"),
	action: varchar({ length: 100 }).notNull(),
	entityType: varchar("entity_type", { length: 50 }),
	entityId: uuid("entity_id"),
	oldValues: jsonb("old_values"),
	newValues: jsonb("new_values"),
	ipAddress: varchar("ip_address", { length: 50 }),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_audit_logs_created").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_audit_logs_tenant").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	index("idx_audit_logs_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "audit_logs_tenant_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "audit_logs_user_id_fkey"
		}),
	pgPolicy("Super admins can view all audit logs", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_super_admin()` }),
	pgPolicy("Users can view own audit logs", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("Service role full access audit_logs", { as: "permissive", for: "all", to: ["service_role"] }),
]);

export const tenants = pgTable("tenants", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	slug: varchar({ length: 100 }).notNull(),
	logoUrl: text("logo_url"),
	isActive: boolean("is_active").default(true),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" }).default(sql`'10737418240'`),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }).default(0),
	settings: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdBy: uuid("created_by"),
	threecxHost: varchar("threecx_host", { length: 255 }),
	threecxPort: integer("threecx_port").default(5432),
	threecxDatabase: varchar("threecx_database", { length: 100 }).default('database_single'),
	threecxUser: varchar("threecx_user", { length: 100 }).default('postgres'),
	threecxPassword: text("threecx_password"),
	threecxChatFilesPath: varchar("threecx_chat_files_path", { length: 500 }).default('/var/lib/3cxpbx/Instance1/Data/Http/Files/Chat Files'),
	threecxRecordingsPath: varchar("threecx_recordings_path", { length: 500 }).default('/var/lib/3cxpbx/Instance1/Data/Recordings'),
	threecxVoicemailPath: varchar("threecx_voicemail_path", { length: 500 }).default('/var/lib/3cxpbx/Instance1/Data/Voicemail'),
	threecxFaxPath: varchar("threecx_fax_path", { length: 500 }).default('/var/lib/3cxpbx/Instance1/Data/Fax'),
	threecxMeetingsPath: varchar("threecx_meetings_path", { length: 500 }).default('/var/lib/3cxpbx/Instance1/Data/Http/Recordings'),
	backupChats: boolean("backup_chats").default(true),
	backupChatMedia: boolean("backup_chat_media").default(true),
	backupRecordings: boolean("backup_recordings").default(true),
	backupVoicemails: boolean("backup_voicemails").default(true),
	backupFaxes: boolean("backup_faxes").default(true),
	backupCdr: boolean("backup_cdr").default(true),
	backupMeetings: boolean("backup_meetings").default(true),
	syncEnabled: boolean("sync_enabled").default(true),
	syncIntervalSeconds: integer("sync_interval_seconds").default(60),
	lastSyncAt: timestamp("last_sync_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_tenants_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_tenants_slug").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	unique("tenants_slug_key").on(table.slug),
	pgPolicy("Super admins can manage all tenants", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_super_admin()`, withCheck: sql`is_super_admin()`  }),
	pgPolicy("Users can view their tenants", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("Service role full access tenants", { as: "permissive", for: "all", to: ["service_role"] }),
]);
export const tenantStorageUsage = pgView("tenant_storage_usage", {	tenantId: uuid("tenant_id"),
	tenantName: varchar("tenant_name", { length: 255 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }),
	chatMediaBytes: numeric("chat_media_bytes"),
	recordingsBytes: numeric("recordings_bytes"),
	voicemailsBytes: numeric("voicemails_bytes"),
	faxesBytes: numeric("faxes_bytes"),
	meetingsBytes: numeric("meetings_bytes"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	mediaFilesCount: bigint("media_files_count", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	recordingsCount: bigint("recordings_count", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	voicemailsCount: bigint("voicemails_count", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	faxesCount: bigint("faxes_count", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	meetingsCount: bigint("meetings_count", { mode: "number" }),
}).as(sql`SELECT t.id AS tenant_id, t.name AS tenant_name, t.storage_quota_bytes, t.storage_used_bytes, COALESCE(sum(mf.file_size), 0::numeric) AS chat_media_bytes, COALESCE(sum(cr.file_size), 0::numeric) AS recordings_bytes, COALESCE(sum(vm.file_size), 0::numeric) AS voicemails_bytes, COALESCE(sum(fx.file_size), 0::numeric) AS faxes_bytes, COALESCE(sum(mr.file_size), 0::numeric) AS meetings_bytes, count(DISTINCT mf.id) AS media_files_count, count(DISTINCT cr.id) AS recordings_count, count(DISTINCT vm.id) AS voicemails_count, count(DISTINCT fx.id) AS faxes_count, count(DISTINCT mr.id) AS meetings_count FROM tenants t LEFT JOIN media_files mf ON mf.tenant_id = t.id LEFT JOIN call_recordings cr ON cr.tenant_id = t.id LEFT JOIN voicemails vm ON vm.tenant_id = t.id LEFT JOIN faxes fx ON fx.tenant_id = t.id LEFT JOIN meeting_recordings mr ON mr.tenant_id = t.id GROUP BY t.id`);