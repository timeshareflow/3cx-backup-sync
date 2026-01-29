import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

interface Message {
  id: string;
  conversation_id: string;
  sender_extension: string | null;
  sender_name: string | null;
  message_text: string | null;
  message_type: string;
  sent_at: string;
  has_media: boolean;
  conversation: {
    id: string;
    conversation_name: string | null;
    is_group_chat: boolean;
    is_external: boolean;
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const since = searchParams.get("since"); // ISO timestamp for polling
  const conversationIds = searchParams.get("conversations")?.split(",").filter(Boolean);

  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({
        data: [],
        message: "No tenant access",
      });
    }

    const supabase = createAdminClient();

    // Check if user is admin (bypass permission filtering)
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", context.userId)
      .single();

    const isSuperAdmin = profile?.role === "super_admin";
    const isGlobalAdmin = profile?.role === "admin";

    // Check if user is a tenant admin
    let isTenantAdmin = false;
    if (!isSuperAdmin && !isGlobalAdmin) {
      const { data: tenantRole } = await supabase
        .from("user_tenants")
        .select("role")
        .eq("user_id", context.userId)
        .eq("tenant_id", context.tenantId)
        .single();

      isTenantAdmin = tenantRole?.role === "admin";
    }

    const bypassFiltering = isSuperAdmin || isGlobalAdmin || isTenantAdmin;

    // Get permitted conversation IDs
    let permittedConversationIds: Set<string> | null = null;

    if (!bypassFiltering) {
      // Get user's permitted conversation IDs
      const { data: conversationPermissions } = await supabase
        .from("user_group_chat_permissions")
        .select("conversation_id")
        .eq("user_id", context.userId)
        .eq("tenant_id", context.tenantId);

      // Also get extension-based permissions for 1-on-1 chats
      const { data: extensionPermissions } = await supabase
        .from("user_extension_permissions")
        .select("extension_id")
        .eq("user_id", context.userId)
        .eq("tenant_id", context.tenantId);

      const permittedExtensionIds = new Set(
        (extensionPermissions || []).map((p) => p.extension_id)
      );

      // Get conversations for permitted extensions
      let extensionConversationIds: string[] = [];
      if (permittedExtensionIds.size > 0) {
        const { data: participants } = await supabase
          .from("participants")
          .select("conversation_id")
          .in("extension_id", Array.from(permittedExtensionIds));

        extensionConversationIds = (participants || []).map((p) => p.conversation_id);
      }

      permittedConversationIds = new Set([
        ...(conversationPermissions || []).map((p) => p.conversation_id),
        ...extensionConversationIds,
      ]);

      if (permittedConversationIds.size === 0) {
        return NextResponse.json({
          data: [],
          message: "No conversations available. Contact your administrator for access.",
        });
      }
    }

    // Build query
    let query = supabase
      .from("messages")
      .select(`
        id,
        conversation_id,
        sender_extension,
        sender_name,
        message_text,
        message_type,
        sent_at,
        has_media,
        conversation:conversations!inner(
          id,
          conversation_name,
          is_group_chat,
          is_external
        )
      `)
      .eq("tenant_id", context.tenantId)
      .order("sent_at", { ascending: false })
      .limit(limit);

    // Filter by specific conversations if provided
    if (conversationIds && conversationIds.length > 0) {
      // Validate user has access to these conversations
      if (permittedConversationIds) {
        const validIds = conversationIds.filter((id) => permittedConversationIds!.has(id));
        if (validIds.length === 0) {
          return NextResponse.json({
            data: [],
            message: "No access to specified conversations.",
          });
        }
        query = query.in("conversation_id", validIds);
      } else {
        query = query.in("conversation_id", conversationIds);
      }
    } else if (permittedConversationIds) {
      // Filter to only permitted conversations
      query = query.in("conversation_id", Array.from(permittedConversationIds));
    }

    // Filter by timestamp for polling
    if (since) {
      query = query.gt("sent_at", since);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error("Error fetching feed messages:", error);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    // Transform the data
    const transformedMessages = (messages || []).map((msg) => {
      const conv = Array.isArray(msg.conversation) ? msg.conversation[0] : msg.conversation;
      return {
        id: msg.id,
        conversationId: msg.conversation_id,
        conversationName: conv?.conversation_name || "Unknown",
        isGroupChat: conv?.is_group_chat || false,
        isExternal: conv?.is_external || false,
        senderExtension: msg.sender_extension,
        senderName: msg.sender_name,
        messageText: msg.message_text,
        messageType: msg.message_type,
        sentAt: msg.sent_at,
        hasMedia: msg.has_media,
      };
    });

    // Get the latest timestamp for polling
    const latestTimestamp = transformedMessages.length > 0
      ? transformedMessages[0].sentAt
      : null;

    const res = NextResponse.json({
      data: transformedMessages,
      latestTimestamp,
      count: transformedMessages.length,
    });

    // Add cache headers for polling
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (error) {
    console.error("Error in monitor feed API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
