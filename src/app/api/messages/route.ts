import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

    const supabase = await createClient();

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

    // Use admin client for messages query since we've already validated:
    // 1. User is authenticated
    // 2. User has tenant access
    // 3. Conversation belongs to this tenant
    // This bypasses RLS which can have issues with complex tenant checks
    const adminSupabase = createAdminClient();

    let query = adminSupabase
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
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: true })
      .limit(limit);

    // Handle pagination
    if (before) {
      query = query.lt("sent_at", before);
    }
    if (after) {
      query = query.gt("sent_at", after);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Error fetching messages:", error);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    const messages = (data || []) as unknown as MessageWithMedia[];

    // Check if there are more messages
    let hasMore = false;
    if (messages.length > 0) {
      const firstMessageTime = messages[0].sent_at;
      const { count: olderCount } = await adminSupabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .lt("sent_at", firstMessageTime);

      hasMore = (olderCount || 0) > 0;
    }

    return NextResponse.json({
      data: messages,
      total: count || 0,
      has_more: hasMore,
    });
  } catch (error) {
    console.error("Error in messages API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
