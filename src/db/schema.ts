import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================
// APP SETTINGS (Global)
// ============================================
export const appSettings = pgTable("app_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 100 }).unique().notNull(),
  value: jsonb("value").notNull().default({}),
  description: text("description"),
  isPublic: boolean("is_public").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================
// TENANTS (Each 3CX instance/customer)
// ============================================
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).unique().notNull(),
    description: text("description"),
    isActive: boolean("is_active").default(true),

    // 3CX Server Connection (SSH-based - no firewall changes needed)
    threecxHost: varchar("threecx_host", { length: 255 }),

    // SSH Credentials (used for both database tunnel and file access)
    sshPort: integer("ssh_port").default(22),
    sshUser: varchar("ssh_user", { length: 100 }),
    sshPassword: text("ssh_password"),

    // PostgreSQL password (connects via SSH tunnel, user is always "phonesystem")
    threecxDbPassword: text("threecx_db_password"),

    // 3CX File Paths
    threecxChatFilesPath: varchar("threecx_chat_files_path", { length: 500 }).default("/var/lib/3cxpbx/Instance1/Data/Http/Files/Chat Files"),
    threecxRecordingsPath: varchar("threecx_recordings_path", { length: 500 }).default("/var/lib/3cxpbx/Instance1/Data/Recordings"),
    threecxVoicemailPath: varchar("threecx_voicemail_path", { length: 500 }).default("/var/lib/3cxpbx/Instance1/Data/Voicemail"),
    threecxFaxPath: varchar("threecx_fax_path", { length: 500 }).default("/var/lib/3cxpbx/Instance1/Data/Fax"),
    threecxMeetingsPath: varchar("threecx_meetings_path", { length: 500 }).default("/var/lib/3cxpbx/Instance1/Data/Http/Recordings"),

    // Backup Settings
    backupChats: boolean("backup_chats").default(true),
    backupChatMedia: boolean("backup_chat_media").default(true),
    backupRecordings: boolean("backup_recordings").default(true),
    backupVoicemails: boolean("backup_voicemails").default(true),
    backupFaxes: boolean("backup_faxes").default(true),
    backupCdr: boolean("backup_cdr").default(true),
    backupMeetings: boolean("backup_meetings").default(true),

    // Settings (stores 3CX config as JSON)
    settings: jsonb("settings").default({}),

    // Storage quota
    storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" }).default(0),
    storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }).default(0),

    // Sync Settings
    syncEnabled: boolean("sync_enabled").default(true),
    syncIntervalSeconds: integer("sync_interval_seconds").default(60),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),

    // Billing/Plan
    planType: varchar("plan_type", { length: 50 }).default("free"),
    planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),

    // Metadata
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    createdBy: uuid("created_by"),
  },
  (table) => ({
    slugIdx: index("idx_tenants_slug").on(table.slug),
    activeIdx: index("idx_tenants_active").on(table.isActive),
  })
);

// ============================================
// USER PROFILES (Extends auth.users)
// ============================================
export const userProfiles = pgTable(
  "user_profiles",
  {
    id: uuid("id").primaryKey(), // References auth.users(id)
    email: varchar("email", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 255 }),
    avatarUrl: text("avatar_url"),
    role: varchar("role", { length: 50 }).notNull().default("user"),
    isProtected: boolean("is_protected").default(false),
    isActive: boolean("is_active").default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    preferences: jsonb("preferences").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    roleIdx: index("idx_user_profiles_role").on(table.role),
    emailIdx: index("idx_user_profiles_email").on(table.email),
  })
);

// ============================================
// USER-TENANT ASSOCIATIONS
// ============================================
export const userTenants = pgTable(
  "user_tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull().default("user"),
    canViewChats: boolean("can_view_chats").default(true),
    canViewRecordings: boolean("can_view_recordings").default(true),
    canViewVoicemails: boolean("can_view_voicemails").default(true),
    canViewFaxes: boolean("can_view_faxes").default(true),
    canViewMeetings: boolean("can_view_meetings").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    invitedBy: uuid("invited_by"),
  },
  (table) => ({
    userIdx: index("idx_user_tenants_user").on(table.userId),
    tenantIdx: index("idx_user_tenants_tenant").on(table.tenantId),
    uniqueUserTenant: uniqueIndex("user_tenants_user_id_tenant_id_key").on(table.userId, table.tenantId),
  })
);

// ============================================
// EXTENSIONS (3CX Users/Extensions)
// ============================================
export const extensions = pgTable(
  "extensions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    extensionNumber: varchar("extension_number", { length: 50 }).notNull(),
    firstName: varchar("first_name", { length: 255 }),
    lastName: varchar("last_name", { length: 255 }),
    displayName: varchar("display_name", { length: 255 }),
    email: varchar("email", { length: 255 }),
    isActive: boolean("is_active").default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_extensions_tenant").on(table.tenantId),
    uniqueTenantExt: uniqueIndex("extensions_tenant_id_extension_number_key").on(table.tenantId, table.extensionNumber),
  })
);

// ============================================
// CONVERSATIONS
// ============================================
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    threecxConversationId: varchar("threecx_conversation_id", { length: 255 }).notNull(),
    conversationName: varchar("conversation_name", { length: 255 }),
    isExternal: boolean("is_external").default(false),
    isGroupChat: boolean("is_group_chat").default(false),
    participantCount: integer("participant_count").default(2),
    firstMessageAt: timestamp("first_message_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    messageCount: integer("message_count").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_conversations_tenant").on(table.tenantId),
    lastMessageIdx: index("idx_conversations_last_message").on(table.tenantId, table.lastMessageAt),
    uniqueTenantConv: uniqueIndex("conversations_tenant_id_threecx_conversation_id_key").on(table.tenantId, table.threecxConversationId),
  })
);

// ============================================
// PARTICIPANTS
// ============================================
export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    participantIdentifier: varchar("participant_identifier", { length: 255 }).notNull(),
    participantName: varchar("participant_name", { length: 255 }),
    participantType: varchar("participant_type", { length: 50 }).default("extension"),
    extensionId: uuid("extension_id").references(() => extensions.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    conversationIdx: index("idx_participants_conversation").on(table.conversationId),
    uniqueConvParticipant: uniqueIndex("participants_conversation_id_participant_identifier_key").on(table.conversationId, table.participantIdentifier),
  })
);

// ============================================
// MESSAGES
// ============================================
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    threecxMessageId: varchar("threecx_message_id", { length: 255 }).notNull(),
    senderIdentifier: varchar("sender_identifier", { length: 255 }),
    senderName: varchar("sender_name", { length: 255 }),
    messageType: varchar("message_type", { length: 50 }).default("text"),
    content: text("content"),
    hasMedia: boolean("has_media").default(false),
    mediaCount: integer("media_count").default(0),
    isDeleted: boolean("is_deleted").default(false),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_messages_tenant").on(table.tenantId),
    conversationIdx: index("idx_messages_conversation").on(table.conversationId),
    sentAtIdx: index("idx_messages_sent_at").on(table.tenantId, table.sentAt),
    uniqueTenantMsg: uniqueIndex("messages_tenant_id_threecx_message_id_key").on(table.tenantId, table.threecxMessageId),
  })
);

// ============================================
// MEDIA FILES
// ============================================
export const mediaFiles = pgTable(
  "media_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    originalFilename: varchar("original_filename", { length: 255 }),
    storagePath: varchar("storage_path", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }),
    fileSize: bigint("file_size", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: integer("duration_seconds"),
    thumbnailPath: varchar("thumbnail_path", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_media_files_tenant").on(table.tenantId),
    messageIdx: index("idx_media_files_message").on(table.messageId),
  })
);

// ============================================
// CALL RECORDINGS
// ============================================
export const callRecordings = pgTable(
  "call_recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    threecxRecordingId: varchar("threecx_recording_id", { length: 255 }),
    callId: varchar("call_id", { length: 255 }),
    callerNumber: varchar("caller_number", { length: 100 }),
    callerName: varchar("caller_name", { length: 255 }),
    calleeNumber: varchar("callee_number", { length: 100 }),
    calleeName: varchar("callee_name", { length: 255 }),
    extensionNumber: varchar("extension_number", { length: 50 }),
    direction: varchar("direction", { length: 20 }),
    originalFilename: varchar("original_filename", { length: 255 }),
    storagePath: varchar("storage_path", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).default("audio/wav"),
    fileSize: bigint("file_size", { mode: "number" }),
    durationSeconds: integer("duration_seconds"),
    callStartedAt: timestamp("call_started_at", { withTimezone: true }),
    callEndedAt: timestamp("call_ended_at", { withTimezone: true }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_recordings_tenant").on(table.tenantId),
    extensionIdx: index("idx_recordings_extension").on(table.tenantId, table.extensionNumber),
    dateIdx: index("idx_recordings_date").on(table.tenantId, table.recordedAt),
    uniqueTenantRec: uniqueIndex("call_recordings_tenant_id_threecx_recording_id_key").on(table.tenantId, table.threecxRecordingId),
  })
);

// ============================================
// VOICEMAILS
// ============================================
export const voicemails = pgTable(
  "voicemails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    threecxVoicemailId: varchar("threecx_voicemail_id", { length: 255 }),
    extensionNumber: varchar("extension_number", { length: 50 }),
    callerNumber: varchar("caller_number", { length: 100 }),
    callerName: varchar("caller_name", { length: 255 }),
    originalFilename: varchar("original_filename", { length: 255 }),
    storagePath: varchar("storage_path", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).default("audio/wav"),
    fileSize: bigint("file_size", { mode: "number" }),
    durationSeconds: integer("duration_seconds"),
    isRead: boolean("is_read").default(false),
    transcription: text("transcription"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_voicemails_tenant").on(table.tenantId),
    extensionIdx: index("idx_voicemails_extension").on(table.tenantId, table.extensionNumber),
    dateIdx: index("idx_voicemails_date").on(table.tenantId, table.receivedAt),
    uniqueTenantVm: uniqueIndex("voicemails_tenant_id_threecx_voicemail_id_key").on(table.tenantId, table.threecxVoicemailId),
  })
);

// ============================================
// FAXES
// ============================================
export const faxes = pgTable(
  "faxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    threecxFaxId: varchar("threecx_fax_id", { length: 255 }),
    extensionNumber: varchar("extension_number", { length: 50 }),
    direction: varchar("direction", { length: 20 }),
    remoteNumber: varchar("remote_number", { length: 100 }),
    remoteName: varchar("remote_name", { length: 255 }),
    pages: integer("pages"),
    originalFilename: varchar("original_filename", { length: 255 }),
    storagePath: varchar("storage_path", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).default("application/pdf"),
    fileSize: bigint("file_size", { mode: "number" }),
    status: varchar("status", { length: 50 }),
    sentReceivedAt: timestamp("sent_received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_faxes_tenant").on(table.tenantId),
    extensionIdx: index("idx_faxes_extension").on(table.tenantId, table.extensionNumber),
    dateIdx: index("idx_faxes_date").on(table.tenantId, table.sentReceivedAt),
    uniqueTenantFax: uniqueIndex("faxes_tenant_id_threecx_fax_id_key").on(table.tenantId, table.threecxFaxId),
  })
);

// ============================================
// CALL LOGS (CDR)
// ============================================
export const callLogs = pgTable(
  "call_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    threecxCallId: varchar("threecx_call_id", { length: 255 }),
    callType: varchar("call_type", { length: 50 }),
    direction: varchar("direction", { length: 20 }),
    callerNumber: varchar("caller_number", { length: 100 }),
    callerName: varchar("caller_name", { length: 255 }),
    calleeNumber: varchar("callee_number", { length: 100 }),
    calleeName: varchar("callee_name", { length: 255 }),
    extensionNumber: varchar("extension_number", { length: 50 }),
    queueName: varchar("queue_name", { length: 255 }),
    ringDuration: integer("ring_duration"),
    talkDuration: integer("talk_duration"),
    totalDuration: integer("total_duration"),
    status: varchar("status", { length: 50 }),
    hangupCause: varchar("hangup_cause", { length: 100 }),
    hasRecording: boolean("has_recording").default(false),
    recordingId: uuid("recording_id").references(() => callRecordings.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_call_logs_tenant").on(table.tenantId),
    extensionIdx: index("idx_call_logs_extension").on(table.tenantId, table.extensionNumber),
    dateIdx: index("idx_call_logs_date").on(table.tenantId, table.startedAt),
    uniqueTenantCall: uniqueIndex("call_logs_tenant_id_threecx_call_id_key").on(table.tenantId, table.threecxCallId),
  })
);

// ============================================
// MEETING RECORDINGS
// ============================================
export const meetingRecordings = pgTable(
  "meeting_recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    threecxMeetingId: varchar("threecx_meeting_id", { length: 255 }),
    meetingName: varchar("meeting_name", { length: 255 }),
    meetingHost: varchar("meeting_host", { length: 255 }),
    hostExtension: varchar("host_extension", { length: 50 }),
    participantCount: integer("participant_count").default(0),
    participants: jsonb("participants").default([]),
    originalFilename: varchar("original_filename", { length: 255 }),
    fileSize: bigint("file_size", { mode: "number" }),
    storagePath: varchar("storage_path", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).default("video/mp4"),
    durationSeconds: integer("duration_seconds"),
    width: integer("width"),
    height: integer("height"),
    hasAudio: boolean("has_audio").default(true),
    hasVideo: boolean("has_video").default(true),
    meetingStartedAt: timestamp("meeting_started_at", { withTimezone: true }),
    meetingEndedAt: timestamp("meeting_ended_at", { withTimezone: true }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_meetings_tenant").on(table.tenantId),
    hostIdx: index("idx_meetings_host").on(table.tenantId, table.hostExtension),
    dateIdx: index("idx_meetings_date").on(table.tenantId, table.recordedAt),
    uniqueTenantMeeting: uniqueIndex("meeting_recordings_tenant_id_threecx_meeting_id_key").on(table.tenantId, table.threecxMeetingId),
  })
);

// ============================================
// SYNC STATUS
// ============================================
export const syncStatus = pgTable(
  "sync_status",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    syncType: varchar("sync_type", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("idle"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastError: text("last_error"),
    itemsSynced: integer("items_synced").default(0),
    itemsFailed: integer("items_failed").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_sync_status_tenant").on(table.tenantId),
    uniqueTenantType: uniqueIndex("sync_status_tenant_id_sync_type_key").on(table.tenantId, table.syncType),
  })
);

// ============================================
// SYNC LOGS
// ============================================
export const syncLogs = pgTable(
  "sync_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    syncType: varchar("sync_type", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    message: text("message"),
    details: jsonb("details"),
    itemsProcessed: integer("items_processed").default(0),
    itemsFailed: integer("items_failed").default(0),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_sync_logs_tenant").on(table.tenantId),
    dateIdx: index("idx_sync_logs_date").on(table.createdAt),
  })
);

// ============================================
// AUDIT LOGS
// ============================================
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => userProfiles.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }),
    entityId: uuid("entity_id"),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("idx_audit_logs_tenant").on(table.tenantId),
    userIdx: index("idx_audit_logs_user").on(table.userId),
    dateIdx: index("idx_audit_logs_date").on(table.createdAt),
  })
);

// ============================================
// RELATIONS
// ============================================
export const tenantsRelations = relations(tenants, ({ many }) => ({
  userTenants: many(userTenants),
  extensions: many(extensions),
  conversations: many(conversations),
  messages: many(messages),
  mediaFiles: many(mediaFiles),
  callRecordings: many(callRecordings),
  voicemails: many(voicemails),
  faxes: many(faxes),
  callLogs: many(callLogs),
  meetingRecordings: many(meetingRecordings),
  syncStatus: many(syncStatus),
  syncLogs: many(syncLogs),
}));

export const userProfilesRelations = relations(userProfiles, ({ many }) => ({
  userTenants: many(userTenants),
}));

export const userTenantsRelations = relations(userTenants, ({ one }) => ({
  user: one(userProfiles, {
    fields: [userTenants.userId],
    references: [userProfiles.id],
  }),
  tenant: one(tenants, {
    fields: [userTenants.tenantId],
    references: [tenants.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [conversations.tenantId],
    references: [tenants.id],
  }),
  participants: many(participants),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [messages.tenantId],
    references: [tenants.id],
  }),
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  mediaFiles: many(mediaFiles),
}));

// Export types
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
export type UserTenant = typeof userTenants.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type CallRecording = typeof callRecordings.$inferSelect;
export type Voicemail = typeof voicemails.$inferSelect;
export type Fax = typeof faxes.$inferSelect;
export type CallLog = typeof callLogs.$inferSelect;
export type MeetingRecording = typeof meetingRecordings.$inferSelect;
