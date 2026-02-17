import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

interface MessageWithMedia {
  id: string;
  sent_at: string;
  conversation_id: string;
  sender_identifier: string | null;
  sender_name: string | null;
  content: string | null;
  message_type: string;
  has_media: boolean;
  media_files: unknown[];
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const conversationId = searchParams.get("conversation_id");
  const before = searchParams.get("before");
  const after = searchParams.get("after");
  const latest = searchParams.get("latest"); // Fetch most recent messages
  const around = searchParams.get("around"); // Fetch messages around a specific message ID
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversation_id is required" },
      { status: 400 }
    );
  }

  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant access" }, { status: 403 });
    }

    // Use admin client to bypass RLS after validating user access
    const supabase = createAdminClient();

    // Verify the conversation belongs to this tenant
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("tenant_id", context.tenantId)
      .single();

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const selectFields = `
        id,
        conversation_id,
        threecx_message_id,
        sender_identifier,
        sender_name,
        content,
        message_type,
        has_media,
        sent_at,
        created_at,
        media_files (*)
      `;

    // Helper: fix orphaned media links
    async function fixOrphanedMedia(msgs: MessageWithMedia[]) {
      for (const msg of msgs) {
        if (msg.has_media && (!msg.media_files || msg.media_files.length === 0) && msg.content) {
          const filename = msg.content.trim();
          const { data: matchedMedia } = await supabase
            .from("media_files")
            .select("*")
            .eq("file_name", filename)
            .limit(1);

          if (matchedMedia && matchedMedia.length > 0) {
            msg.media_files = matchedMedia;
            await supabase
              .from("media_files")
              .update({ message_id: msg.id, conversation_id: msg.conversation_id })
              .eq("id", matchedMedia[0].id);
          }
        }
      }
    }

    // "Around" mode: fetch a window of messages centered on a specific message
    if (around) {
      // Look up the target message's timestamp
      const { data: targetMsg, error: targetErr } = await supabase
        .from("messages")
        .select("sent_at")
        .eq("id", around)
        .eq("conversation_id", conversationId)
        .single();

      if (targetErr || !targetMsg) {
        return NextResponse.json(
          { error: "Target message not found" },
          { status: 404 }
        );
      }

      const targetTime = targetMsg.sent_at;
      const halfWindow = 25;

      // Fetch messages before (including the target)
      const { data: beforeData } = await supabase
        .from("messages")
        .select(selectFields)
        .eq("conversation_id", conversationId)
        .lte("sent_at", targetTime)
        .order("sent_at", { ascending: false })
        .limit(halfWindow + 1); // +1 to include the target itself

      // Fetch messages after the target
      const { data: afterData } = await supabase
        .from("messages")
        .select(selectFields)
        .eq("conversation_id", conversationId)
        .gt("sent_at", targetTime)
        .order("sent_at", { ascending: true })
        .limit(halfWindow);

      // Merge and deduplicate by id, in chronological order
      const beforeMsgs = ((beforeData || []) as unknown as MessageWithMedia[]).reverse();
      const afterMsgs = (afterData || []) as unknown as MessageWithMedia[];
      const seen = new Set<string>();
      const messages: MessageWithMedia[] = [];
      for (const m of [...beforeMsgs, ...afterMsgs]) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          messages.push(m);
        }
      }

      await fixOrphanedMedia(messages);

      // Check for older/newer messages beyond the window
      let hasMore = false;
      if (messages.length > 0) {
        const { count: olderCount } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversationId)
          .lt("sent_at", messages[0].sent_at);
        hasMore = (olderCount || 0) > 0;
      }

      let hasNewer = false;
      if (messages.length > 0) {
        const { count: newerCount } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversationId)
          .gt("sent_at", messages[messages.length - 1].sent_at);
        hasNewer = (newerCount || 0) > 0;
      }

      return NextResponse.json({
        data: messages,
        total: messages.length,
        has_more: hasMore,
        has_newer: hasNewer,
      });
    }

    // When "latest" is set, fetch the most recent messages (for initial monitor load)
    // When "before" is set, fetch older messages (for infinite scroll up)
    // When "after" is set, fetch newer messages (for polling new messages)
    const isLatestMode = latest === "true" && !before && !after;

    let query = supabase
      .from("messages")
      .select(selectFields, { count: "exact" })
      .eq("conversation_id", conversationId);

    // Handle pagination
    if (before) {
      query = query.lt("sent_at", before);
    }
    if (after) {
      query = query.gt("sent_at", after);
    }

    // Order: descending for latest mode (to get newest first), then we'll reverse
    // For before/after pagination, use appropriate order
    if (isLatestMode || before) {
      query = query.order("sent_at", { ascending: false }).limit(limit);
    } else {
      query = query.order("sent_at", { ascending: true }).limit(limit);
    }

    const { data, error, count } = await query;

    // For latest mode or "before" pagination, reverse to chronological order
    let messages = (data || []) as unknown as MessageWithMedia[];
    if (isLatestMode || before) {
      messages = messages.reverse();
    }

    if (error) {
      console.error("Error fetching messages:", error);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    await fixOrphanedMedia(messages);

    // Check if there are older messages (for infinite scroll up)
    let hasMore = false;
    if (messages.length > 0) {
      const firstMessageTime = messages[0].sent_at;
      const { count: olderCount } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .lt("sent_at", firstMessageTime);

      hasMore = (olderCount || 0) > 0;
    }

    // Check if there are newer messages (for polling)
    let hasNewer = false;
    if (messages.length > 0) {
      const lastMessageTime = messages[messages.length - 1].sent_at;
      const { count: newerCount } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .gt("sent_at", lastMessageTime);

      hasNewer = (newerCount || 0) > 0;
    }

    return NextResponse.json({
      data: messages,
      total: count || 0,
      has_more: hasMore,
      has_newer: hasNewer,
    });
  } catch (error) {
    console.error("Error in messages API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
