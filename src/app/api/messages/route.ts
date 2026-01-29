import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

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

    // When "latest" is set, fetch the most recent messages (for initial monitor load)
    // When "before" is set, fetch older messages (for infinite scroll up)
    // When "after" is set, fetch newer messages (for polling new messages)
    const isLatestMode = latest === "true" && !before && !after;

    let query = supabase
      .from("messages")
      .select(
        `
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
      `,
        { count: "exact" }
      )
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
