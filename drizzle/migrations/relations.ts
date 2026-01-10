import { relations } from "drizzle-orm/relations";
import { usersInAuth, userTenants, tenants, userProfiles, tenantSettings, conversations, participants, extensions, messages, mediaFiles, callRecordings, voicemails, faxes, callLogs, meetingRecordings, syncStatus, syncLogs, storageUsage, auditLogs } from "./schema";

export const userTenantsRelations = relations(userTenants, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [userTenants.invitedBy],
		references: [usersInAuth.id]
	}),
	tenant: one(tenants, {
		fields: [userTenants.tenantId],
		references: [tenants.id]
	}),
	userProfile: one(userProfiles, {
		fields: [userTenants.userId],
		references: [userProfiles.id]
	}),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	userTenants: many(userTenants),
	userProfiles: many(userProfiles),
	auditLogs: many(auditLogs),
}));

export const tenantsRelations = relations(tenants, ({many}) => ({
	userTenants: many(userTenants),
	tenantSettings: many(tenantSettings),
	conversations: many(conversations),
	messages: many(messages),
	mediaFiles: many(mediaFiles),
	callRecordings: many(callRecordings),
	voicemails: many(voicemails),
	faxes: many(faxes),
	callLogs: many(callLogs),
	meetingRecordings: many(meetingRecordings),
	extensions: many(extensions),
	syncStatuses: many(syncStatus),
	syncLogs: many(syncLogs),
	storageUsages: many(storageUsage),
	auditLogs: many(auditLogs),
}));

export const userProfilesRelations = relations(userProfiles, ({one, many}) => ({
	userTenants: many(userTenants),
	usersInAuth: one(usersInAuth, {
		fields: [userProfiles.id],
		references: [usersInAuth.id]
	}),
}));

export const tenantSettingsRelations = relations(tenantSettings, ({one}) => ({
	tenant: one(tenants, {
		fields: [tenantSettings.tenantId],
		references: [tenants.id]
	}),
}));

export const conversationsRelations = relations(conversations, ({one, many}) => ({
	tenant: one(tenants, {
		fields: [conversations.tenantId],
		references: [tenants.id]
	}),
	participants: many(participants),
	messages: many(messages),
}));

export const participantsRelations = relations(participants, ({one, many}) => ({
	conversation: one(conversations, {
		fields: [participants.conversationId],
		references: [conversations.id]
	}),
	extension: one(extensions, {
		fields: [participants.extensionId],
		references: [extensions.id]
	}),
	messages: many(messages),
}));

export const extensionsRelations = relations(extensions, ({one, many}) => ({
	participants: many(participants),
	callRecordings: many(callRecordings),
	voicemails: many(voicemails),
	faxes: many(faxes),
	callLogs: many(callLogs),
	meetingRecordings: many(meetingRecordings),
	tenant: one(tenants, {
		fields: [extensions.tenantId],
		references: [tenants.id]
	}),
}));

export const messagesRelations = relations(messages, ({one, many}) => ({
	conversation: one(conversations, {
		fields: [messages.conversationId],
		references: [conversations.id]
	}),
	participant: one(participants, {
		fields: [messages.senderParticipantId],
		references: [participants.id]
	}),
	tenant: one(tenants, {
		fields: [messages.tenantId],
		references: [tenants.id]
	}),
	mediaFiles: many(mediaFiles),
}));

export const mediaFilesRelations = relations(mediaFiles, ({one}) => ({
	message: one(messages, {
		fields: [mediaFiles.messageId],
		references: [messages.id]
	}),
	tenant: one(tenants, {
		fields: [mediaFiles.tenantId],
		references: [tenants.id]
	}),
}));

export const callRecordingsRelations = relations(callRecordings, ({one, many}) => ({
	extension: one(extensions, {
		fields: [callRecordings.extensionId],
		references: [extensions.id]
	}),
	tenant: one(tenants, {
		fields: [callRecordings.tenantId],
		references: [tenants.id]
	}),
	callLogs: many(callLogs),
}));

export const voicemailsRelations = relations(voicemails, ({one}) => ({
	extension: one(extensions, {
		fields: [voicemails.extensionId],
		references: [extensions.id]
	}),
	tenant: one(tenants, {
		fields: [voicemails.tenantId],
		references: [tenants.id]
	}),
}));

export const faxesRelations = relations(faxes, ({one}) => ({
	extension: one(extensions, {
		fields: [faxes.extensionId],
		references: [extensions.id]
	}),
	tenant: one(tenants, {
		fields: [faxes.tenantId],
		references: [tenants.id]
	}),
}));

export const callLogsRelations = relations(callLogs, ({one}) => ({
	extension: one(extensions, {
		fields: [callLogs.extensionId],
		references: [extensions.id]
	}),
	callRecording: one(callRecordings, {
		fields: [callLogs.recordingId],
		references: [callRecordings.id]
	}),
	tenant: one(tenants, {
		fields: [callLogs.tenantId],
		references: [tenants.id]
	}),
}));

export const meetingRecordingsRelations = relations(meetingRecordings, ({one}) => ({
	extension: one(extensions, {
		fields: [meetingRecordings.organizerExtensionId],
		references: [extensions.id]
	}),
	tenant: one(tenants, {
		fields: [meetingRecordings.tenantId],
		references: [tenants.id]
	}),
}));

export const syncStatusRelations = relations(syncStatus, ({one}) => ({
	tenant: one(tenants, {
		fields: [syncStatus.tenantId],
		references: [tenants.id]
	}),
}));

export const syncLogsRelations = relations(syncLogs, ({one}) => ({
	tenant: one(tenants, {
		fields: [syncLogs.tenantId],
		references: [tenants.id]
	}),
}));

export const storageUsageRelations = relations(storageUsage, ({one}) => ({
	tenant: one(tenants, {
		fields: [storageUsage.tenantId],
		references: [tenants.id]
	}),
}));

export const auditLogsRelations = relations(auditLogs, ({one}) => ({
	tenant: one(tenants, {
		fields: [auditLogs.tenantId],
		references: [tenants.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [auditLogs.userId],
		references: [usersInAuth.id]
	}),
}));