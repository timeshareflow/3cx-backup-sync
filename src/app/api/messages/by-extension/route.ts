import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const extensionId = searchParams.get("extension_id");
  const before = searchParams.get("before");
  const after = searchParams.get("after");
  const latest = searchParams.get("latest");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  if (!extensionId) {
    return NextResponse.json(
      { error: "extension_id is required" },
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

    const supabase = createAdminClient();

    // Verify the extension belongs to this tenant
    const { data: extension } = await supabase
      .from("extensions")
      .select("id, extension_number, display_name")
      .eq("id", extensionId)
      .eq("tenant_id", context.tenantId)
      .single();

    if (!extension) {
      return NextResponse.json(
        { error: "Extension not found" },
        { status: 404 }
      );
    }

    // Find all conversations this extension participates in
    const { data: participations } = await supabase
      .from("participants")
      .select("conversation_id")
      .eq("extension_id", extensionId);

    // Also check by external_id (extension number) for participants without extension_id set
    const { data: participations2 } = await supabase
      .from("participants")
      .select("conversation_id")
      .eq("external_id", extension.extension_number)
      .is("extension_id", null);

    const conversationIds = [
      ...new Set([
        ...(participations || []).map((p) => p.conversation_id),
        ...(participations2 || []).map((p) => p.conversation_id),
      ]),
    ];

    if (conversationIds.length === 0) {
      return NextResponse.json({
        data: [],
        conversations: [],
        total: 0,
        has_more: false,
        has_newer: false,
      });
    }

    // Fetch conversation names for labeling
    const { data: convData } = await supabase
      .from("conversations")
      .select("id, conversation_name, is_group_chat, is_external")
      .in("id", conversationIds);

    const convMap: Record<
      string,
      { name: string; is_group_chat: boolean; is_external: boolean }
    > = {};
    for (const c of convData || []) {
      convMap[c.id] = {
        name: c.conversation_name || "Unnamed",
        is_group_chat: c.is_group_chat,
        is_external: c.is_external,
      };
    }

    // Fetch messages across all conversations
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
      .in("conversation_id", conversationIds);

    if (before) {
      query = query.lt("sent_at", before);
    }
    if (after) {
      query = query.gt("sent_at", after);
    }

    if (isLatestMode || before) {
      query = query.order("sent_at", { ascending: false }).limit(limit);
    } else {
      query = query.order("sent_at", { ascending: true }).limit(limit);
    }

    const { data, error, count } = await query;

    let messages = data || [];
    if (isLatestMode || before) {
      messages = messages.reverse();
    }

    if (error) {
      console.error("Error fetching messages by extension:", error);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    // Enrich messages with conversation info
    const enrichedMessages = messages.map((msg) => ({
      ...msg,
      conversation_name: convMap[msg.conversation_id]?.name || "Unknown",
      is_group_chat: convMap[msg.conversation_id]?.is_group_chat || false,
      is_external: convMap[msg.conversation_id]?.is_external || false,
    }));

    // Check if there are older messages
    let hasMore = false;
    if (messages.length > 0) {
      const firstMessageTime = messages[0].sent_at;
      const { count: olderCount } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", conversationIds)
        .lt("sent_at", firstMessageTime);

      hasMore = (olderCount || 0) > 0;
    }

    // Check if there are newer messages
    let hasNewer = false;
    if (messages.length > 0) {
      const lastMessageTime = messages[messages.length - 1].sent_at;
      const { count: newerCount } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", conversationIds)
        .gt("sent_at", lastMessageTime);

      hasNewer = (newerCount || 0) > 0;
    }

    return NextResponse.json({
      data: enrichedMessages,
      conversations: Object.entries(convMap).map(([id, info]) => ({
        id,
        ...info,
      })),
      total: count || 0,
      has_more: hasMore,
      has_newer: hasNewer,
    });
  } catch (error) {
    console.error("Error in messages by extension API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
