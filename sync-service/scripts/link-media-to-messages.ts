/**
 * Link Media Files to Messages
 *
 * This script correlates media files in the database with their corresponding messages.
 * It looks for filename patterns in message content and updates media files with
 * the correct message_id and conversation_id.
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MediaFile {
  id: string;
  file_name: string;
  tenant_id: string;
  message_id: string | null;
  conversation_id: string | null;
  storage_path: string;
}

interface Message {
  id: string;
  conversation_id: string;
  tenant_id: string;
  content: string | null;
  has_media: boolean;
  sent_at: string;
}

// Extract potential filename from message content
function extractFilenamesFromContent(content: string | null): string[] {
  if (!content) return [];

  const filenames: string[] = [];

  // Common patterns in 3CX chat messages for media
  // Pattern 1: Just a filename like "IMG_20240115_123456.jpg"
  const filenamePattern = /([A-Za-z0-9_-]+\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|webm|wav|mp3|pdf|doc|docx))/gi;
  let match;
  while ((match = filenamePattern.exec(content)) !== null) {
    filenames.push(match[1].toLowerCase());
  }

  // Pattern 2: [image] marker followed by or preceded by filename
  // Pattern 3: URL-encoded filenames
  const urlPattern = /%[0-9A-Fa-f]{2}/g;
  if (urlPattern.test(content)) {
    try {
      const decoded = decodeURIComponent(content);
      while ((match = filenamePattern.exec(decoded)) !== null) {
        filenames.push(match[1].toLowerCase());
      }
    } catch {
      // Ignore decoding errors
    }
  }

  // Pattern 4: UUID-based filenames
  const uuidPattern = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|jpeg|png|gif|mp4|mov)/gi;
  while ((match = uuidPattern.exec(content)) !== null) {
    filenames.push(match[0].toLowerCase());
  }

  return [...new Set(filenames)]; // Remove duplicates
}

// Match media file to a message
function findMatchingMessage(
  media: MediaFile,
  messages: Message[]
): Message | null {
  const mediaFilename = media.file_name.toLowerCase();
  const mediaBasename = mediaFilename.replace(/\.[^/.]+$/, ""); // Remove extension

  for (const msg of messages) {
    if (!msg.content) continue;

    const contentLower = msg.content.toLowerCase();

    // Direct filename match
    if (contentLower.includes(mediaFilename)) {
      return msg;
    }

    // Basename match (without extension)
    if (mediaBasename.length > 5 && contentLower.includes(mediaBasename)) {
      return msg;
    }

    // Extract filenames from content and compare
    const extractedFilenames = extractFilenamesFromContent(msg.content);
    if (extractedFilenames.some(fn => fn === mediaFilename || fn.includes(mediaBasename))) {
      return msg;
    }
  }

  return null;
}

async function getOrphanedMediaFiles(tenantId: string): Promise<MediaFile[]> {
  const { data, error } = await supabase
    .from("media_files")
    .select("id, file_name, tenant_id, message_id, conversation_id, storage_path")
    .eq("tenant_id", tenantId)
    .is("message_id", null);

  if (error) {
    console.error("Error fetching orphaned media:", error);
    return [];
  }

  return data || [];
}

async function getMessagesWithMedia(tenantId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, tenant_id, content, has_media, sent_at")
    .eq("tenant_id", tenantId)
    .eq("has_media", true)
    .order("sent_at", { ascending: false });

  if (error) {
    console.error("Error fetching messages with media:", error);
    return [];
  }

  return data || [];
}

async function updateMediaFile(
  mediaId: string,
  messageId: string,
  conversationId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("media_files")
    .update({
      message_id: messageId,
      conversation_id: conversationId,
    })
    .eq("id", mediaId);

  if (error) {
    console.error(`Failed to update media ${mediaId}:`, error.message);
    return false;
  }

  return true;
}

async function linkMediaForTenant(tenantId: string, tenantName: string): Promise<void> {
  console.log(`\nProcessing tenant: ${tenantName} (${tenantId})`);

  // Get all orphaned media files (no message_id)
  const orphanedMedia = await getOrphanedMediaFiles(tenantId);
  console.log(`  Found ${orphanedMedia.length} media files without message links`);

  if (orphanedMedia.length === 0) return;

  // Get all messages that have media
  const messagesWithMedia = await getMessagesWithMedia(tenantId);
  console.log(`  Found ${messagesWithMedia.length} messages with has_media=true`);

  // Also get recent messages that might have media references
  const { data: recentMessages } = await supabase
    .from("messages")
    .select("id, conversation_id, tenant_id, content, has_media, sent_at")
    .eq("tenant_id", tenantId)
    .order("sent_at", { ascending: false })
    .limit(1000);

  const allMessages = [...messagesWithMedia];
  if (recentMessages) {
    for (const msg of recentMessages) {
      if (!allMessages.find(m => m.id === msg.id)) {
        allMessages.push(msg);
      }
    }
  }

  console.log(`  Total messages to check: ${allMessages.length}`);

  let linked = 0;
  let unlinked = 0;

  for (const media of orphanedMedia) {
    const matchingMessage = findMatchingMessage(media, allMessages);

    if (matchingMessage) {
      const success = await updateMediaFile(
        media.id,
        matchingMessage.id,
        matchingMessage.conversation_id
      );
      if (success) {
        linked++;
        console.log(`    Linked: ${media.file_name} -> message ${matchingMessage.id.slice(0, 8)}...`);
      }
    } else {
      unlinked++;
      console.log(`    No match: ${media.file_name}`);
    }
  }

  console.log(`  Summary: ${linked} linked, ${unlinked} unmatched`);
}

async function main(): Promise<void> {
  console.log("===========================================");
  console.log("  Link Media Files to Messages");
  console.log("===========================================\n");

  // Get all tenants
  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("is_active", true);

  if (error || !tenants) {
    console.error("Failed to fetch tenants:", error);
    return;
  }

  console.log(`Found ${tenants.length} active tenants`);

  for (const tenant of tenants) {
    await linkMediaForTenant(tenant.id, tenant.name);
  }

  console.log("\n===========================================");
  console.log("  Link Complete!");
  console.log("===========================================");
}

main().catch(console.error);
