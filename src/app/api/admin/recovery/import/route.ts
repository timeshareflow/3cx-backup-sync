import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

function getS3Client() {
  return new S3Client({
    endpoint: `https://${process.env.DO_SPACES_ENDPOINT || "nyc3.digitaloceanspaces.com"}`,
    region: process.env.DO_SPACES_REGION || "nyc3",
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY || "",
      secretAccessKey: process.env.DO_SPACES_SECRET || "",
    },
    forcePathStyle: false,
  });
}

async function uploadToSpaces(
  tenantId: string,
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const bucket = process.env.DO_SPACES_BUCKET || "3cxbackupwiz";
  // Sanitize filename
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  const key = `${tenantId}/recovered/${Date.now()}_${safeName}`;

  await getS3Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: "private",
  }));

  return key;
}

export const dynamic = "force-dynamic";

// Max payload: 50 MB (large JSON files from many browser exports)
export const maxDuration = 120;

interface ExtractedRecord {
  _db?: string;
  _store?: string;
  _recoveredAt?: string;
  [key: string]: unknown;
}

interface ImportPayload {
  extractedAt?: string;
  scriptVersion?: string;
  origin?: string;
  userAgent?: string;
  recoveryRange?: { from: string; to: string };
  recoveredMessages?: ExtractedRecord[];
  recoveredMedia?: Array<{
    url: string;
    filename: string;
    cacheName: string;
    contentType: string;
    sizeBytes: number;
    base64?: string;   // data URL: "data:image/jpeg;base64,..."
    skipped?: boolean;
    reason?: string;
  }>;
  otherData?: Record<string, unknown[]>;
  databases?: unknown[];
}

// ─── Field-name candidates for mapping 3CX client data to our schema ────────

function pick(record: ExtractedRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
      return record[key];
    }
  }
  return null;
}

function pickString(record: ExtractedRecord, ...keys: string[]): string | null {
  const v = pick(record, ...keys);
  return v != null ? String(v) : null;
}

function pickTimestamp(record: ExtractedRecord, ...keys: string[]): string | null {
  const v = pick(record, ...keys);
  if (!v) return null;
  const n = typeof v === "number" ? (v > 1e12 ? v : v * 1000) : NaN;
  const d = isNaN(n) ? new Date(v as string | number) : new Date(n);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function pickBool(record: ExtractedRecord, ...keys: string[]): boolean {
  const v = pick(record, ...keys);
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v === "true" || v === "1";
  return false;
}

function mapMessageType(record: ExtractedRecord): "text" | "image" | "video" | "file" {
  const t = pickString(record, "messageType", "type", "contentType", "mediaType");
  if (!t) return "text";
  const lower = t.toLowerCase();
  if (lower.includes("image") || lower.includes("photo") || lower.includes("picture")) return "image";
  if (lower.includes("video")) return "video";
  if (lower.includes("file") || lower.includes("document") || lower.includes("attachment")) return "file";
  return "text";
}

// Extract conversation ID from message record (3CX uses various field names)
function extractConversationId(record: ExtractedRecord): string | null {
  return pickString(
    record,
    "conversationId", "conversation_id", "chatId", "chat_id",
    "roomId", "room_id", "channelId", "channel_id", "threadId"
  );
}

// Extract the 3CX message ID
function extractMessageId(record: ExtractedRecord): string | null {
  return pickString(
    record,
    "id", "messageId", "message_id", "msgId", "msg_id", "Id", "ID"
  );
}

// Extract sent timestamp
function extractSentAt(record: ExtractedRecord): string | null {
  return pickTimestamp(
    record,
    "timeSent", "time_sent", "timestamp", "createdAt", "created_at",
    "sentAt", "sent_at", "time", "date", "dateTime", "dt"
  );
}

// Extract sender info
function extractSender(record: ExtractedRecord): { identifier: string | null; name: string | null } {
  const identifier = pickString(
    record,
    "senderNo", "sender_no", "senderExtension", "senderParticipantNo",
    "sender_participant_no", "from", "fromNo", "from_no", "extension",
    "senderIdentifier", "sender_identifier"
  );
  const name = pickString(
    record,
    "senderName", "sender_name", "senderParticipantName", "sender_participant_name",
    "fromName", "from_name", "displayName", "display_name", "author", "authorName"
  );
  return { identifier, name };
}

// Extract message content
function extractContent(record: ExtractedRecord): string | null {
  return pickString(
    record,
    "message", "text", "body", "content", "messageText", "message_text",
    "msg", "caption", "description"
  );
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins can import recovered data
    const supabase = createAdminClient();
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", context.userId)
      .single();

    const isAdmin =
      profile?.role === "super_admin" ||
      profile?.role === "admin";

    if (!isAdmin && context.tenantId) {
      const { data: tenantRole } = await supabase
        .from("user_tenants")
        .select("role")
        .eq("user_id", context.userId)
        .eq("tenant_id", context.tenantId)
        .single();
      if (tenantRole?.role !== "admin") {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant selected" }, { status: 403 });
    }

    const payload: ImportPayload = await request.json();

    if (!payload.recoveredMessages || !Array.isArray(payload.recoveredMessages)) {
      return NextResponse.json(
        { error: "Invalid payload: recoveredMessages array required" },
        { status: 400 }
      );
    }

    console.log(`[Recovery] Import started by ${context.userId} for tenant ${context.tenantId}`);
    console.log(`[Recovery] Source: ${payload.origin || "unknown"}, UA: ${payload.userAgent?.slice(0, 80) || "unknown"}`);
    console.log(`[Recovery] Records to process: ${payload.recoveredMessages.length}`);

    const results = {
      total: payload.recoveredMessages.length,
      conversationsCreated: 0,
      messagesImported: 0,
      messagesSkipped: 0,
      mediaImported: 0,
      mediaSkipped: 0,
      errors: [] as Array<{ index: number; reason: string; record?: unknown }>,
    };

    // Track conversations created this run to avoid re-querying
    const conversationIdCache = new Map<string, string>(); // threecxId → supabase UUID

    for (let i = 0; i < payload.recoveredMessages.length; i++) {
      const record = payload.recoveredMessages[i];

      try {
        // Extract fields
        const threecxConvId = extractConversationId(record);
        const threecxMsgId = extractMessageId(record);
        const sentAt = extractSentAt(record);
        const content = extractContent(record);
        const { identifier: senderIdentifier, name: senderName } = extractSender(record);
        const messageType = mapMessageType(record);
        const hasMedia = pickBool(record, "hasMedia", "has_media", "isMedia", "isFile") || messageType !== "text";
        const isExternal = pickBool(record, "isExternal", "is_external", "external");

        // Validation
        if (!threecxConvId) {
          results.errors.push({ index: i, reason: "No conversation ID found", record });
          continue;
        }
        if (!sentAt) {
          results.errors.push({ index: i, reason: "No timestamp found", record });
          continue;
        }

        // Generate a stable message ID if 3CX didn't provide one
        // Use conversation + sender + timestamp as a fingerprint
        const effectiveMsgId =
          threecxMsgId ||
          `recovered-${threecxConvId}-${senderIdentifier || "unknown"}-${sentAt}`;

        // ── Upsert conversation ──────────────────────────────────────────────
        let convUUID = conversationIdCache.get(threecxConvId);

        if (!convUUID) {
          // Check if conversation already exists
          const { data: existingConv } = await supabase
            .from("conversations")
            .select("id")
            .eq("tenant_id", context.tenantId)
            .eq("threecx_conversation_id", threecxConvId)
            .single();

          if (existingConv) {
            convUUID = existingConv.id;
          } else {
            // Build conversation name from 3CX data
            const convName = pickString(
              record,
              "chatName", "chat_name", "conversationName", "conversation_name",
              "roomName", "room_name", "groupName"
            ) || senderName || null;

            const isGroupChat = pickBool(record, "isGroup", "is_group", "isGroupChat", "groupChat");

            const { data: newConv, error: convError } = await supabase
              .from("conversations")
              .upsert({
                tenant_id: context.tenantId,
                threecx_conversation_id: threecxConvId,
                conversation_name: convName,
                is_external: isExternal,
                is_group_chat: isGroupChat,
                channel_type: "internal",
                participant_count: 2,
              }, {
                onConflict: "tenant_id,threecx_conversation_id",
              })
              .select("id")
              .single();

            if (convError || !newConv) {
              results.errors.push({
                index: i,
                reason: `Conversation upsert failed: ${convError?.message || "no data"}`,
              });
              continue;
            }

            convUUID = newConv.id;
            results.conversationsCreated++;
          }

          if (convUUID) conversationIdCache.set(threecxConvId, convUUID);
        }

        if (!convUUID) {
          results.errors.push({ index: i, reason: "Could not resolve conversation UUID" });
          continue;
        }

        // ── Insert message ──────────────────────────────────────────────────
        const { data: existing } = await supabase
          .from("messages")
          .select("id")
          .eq("tenant_id", context.tenantId)
          .eq("threecx_message_id", effectiveMsgId)
          .single();

        if (existing) {
          results.messagesSkipped++;
          continue;
        }

        const { error: msgError } = await supabase.from("messages").insert({
          tenant_id: context.tenantId,
          conversation_id: convUUID,
          threecx_message_id: effectiveMsgId,
          sender_identifier: senderIdentifier,
          sender_name: senderName,
          content: content,
          message_type: messageType,
          has_media: hasMedia,
          sent_at: sentAt,
        });

        if (msgError) {
          if (msgError.code === "23505") {
            results.messagesSkipped++;
          } else {
            results.errors.push({
              index: i,
              reason: `Message insert failed: ${msgError.message}`,
            });
          }
          continue;
        }

        results.messagesImported++;

        // ── Update conversation stats ────────────────────────────────────────
        // Update message_count + last_message_at for this conversation periodically
        if (results.messagesImported % 50 === 0) {
          await supabase.rpc("update_conversation_stats", { conv_id: convUUID }).maybeSingle();
        }
      } catch (err) {
        results.errors.push({
          index: i,
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    // Final conversation stats refresh for all touched conversations
    for (const convUUID of conversationIdCache.values()) {
      await supabase
        .from("conversations")
        .update({
          message_count: supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", convUUID) as unknown as number,
        })
        .eq("id", convUUID)
        .then(() => {}); // best-effort, ignore errors
    }

    // ── Phase 2: Import media files ────────────────────────────────────────
    const mediaItems = (payload.recoveredMedia || []).filter(m => !m.skipped && m.base64);
    console.log(`[Recovery] Media files to process: ${mediaItems.length}`);

    const spacesConfigured = !!(process.env.DO_SPACES_KEY && process.env.DO_SPACES_SECRET);

    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];
      try {
        // Check for duplicate by original URL stored in metadata
        const { data: existingMedia } = await supabase
          .from("media_files")
          .select("id")
          .eq("tenant_id", context.tenantId)
          .contains("metadata", { recovered_url: item.url })
          .limit(1);

        if (existingMedia && existingMedia.length > 0) {
          results.mediaSkipped++;
          continue;
        }

        // Decode base64 data URL → Buffer
        // Format: "data:image/jpeg;base64,/9j/4AAQ..."
        const commaIdx = item.base64!.indexOf(",");
        if (commaIdx === -1) {
          results.errors.push({ index: i, reason: `Media ${item.filename}: invalid base64 data URL` });
          continue;
        }
        const base64Data = item.base64!.slice(commaIdx + 1);
        const buffer = Buffer.from(base64Data, "base64");

        let storagePath: string | null = null;
        if (spacesConfigured) {
          try {
            storagePath = await uploadToSpaces(context.tenantId, item.filename, buffer, item.contentType);
          } catch (uploadErr) {
            console.error(`[Recovery] Spaces upload failed for ${item.filename}:`, uploadErr);
            results.errors.push({ index: i, reason: `Upload failed: ${uploadErr instanceof Error ? uploadErr.message : "unknown"}` });
            continue;
          }
        } else {
          // Spaces not configured — store metadata only so we know what was recovered
          storagePath = `recovered/${context.tenantId}/${item.filename}`;
        }

        const { error: mediaError } = await supabase.from("media_files").insert({
          tenant_id: context.tenantId,
          file_name: item.filename,
          file_size: item.sizeBytes,
          mime_type: item.contentType,
          storage_path: storagePath,
          metadata: {
            recovered_url: item.url,
            cache_name: item.cacheName,
            recovered_at: new Date().toISOString(),
            spaces_uploaded: spacesConfigured,
          },
        });

        if (mediaError) {
          if (mediaError.code === "23505") {
            results.mediaSkipped++;
          } else {
            results.errors.push({ index: i, reason: `Media insert failed: ${mediaError.message}` });
          }
          continue;
        }

        results.mediaImported++;
      } catch (err) {
        results.errors.push({ index: i, reason: `Media ${item.filename}: ${err instanceof Error ? err.message : "unknown"}` });
      }
    }

    console.log(
      `[Recovery] Import complete: ${results.messagesImported} messages, ` +
      `${results.mediaImported} media imported, ${results.errors.length} errors`
    );

    return NextResponse.json({
      success: true,
      results: {
        ...results,
        errors: results.errors.slice(0, 20).map(e => ({ index: e.index, reason: e.reason })),
        errorCount: results.errors.length,
      },
    });
  } catch (error) {
    console.error("[Recovery] Import failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
