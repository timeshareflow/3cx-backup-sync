import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = (page - 1) * limit;

  // Optional filters
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");
  const sender = searchParams.get("sender");
  const hasMedia = searchParams.get("has_media");
  const conversationId = searchParams.get("conversation_id");
  const channelType = searchParams.get("channel_type");

  // Allow empty query if date filters are provided (date-based browsing)
  const hasDateFilter = startDate || endDate;
  if (!hasDateFilter && (!query || query.trim().length < 2)) {
    return NextResponse.json(
      { error: "Search query must be at least 2 characters, or provide date filters" },
      { status: 400 }
    );
  }

  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({
        data: [],
        total: 0,
        page,
        page_size: limit,
        has_more: false,
      });
    }

    // Use admin client to bypass RLS - we've already validated tenant access
    const supabase = createAdminClient();

    // Build the search query with tenant filter via conversations join
    let dbQuery = supabase
      .from("messages")
      .select(
        `
        *,
        media_files (*),
        conversations!inner (id, conversation_name, channel_type, threecx_conversation_id, tenant_id)
      `,
        { count: "exact" }
      )
      .eq("conversations.tenant_id", context.tenantId)
      .order("sent_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply text search (use ilike for simple search, works without full-text index)
    if (query && query.trim()) {
      dbQuery = dbQuery.ilike("content", `%${query.trim()}%`);
    }

    // Apply filters
    if (startDate) {
      dbQuery = dbQuery.gte("sent_at", `${startDate}T00:00:00.000Z`);
    }
    if (endDate) {
      dbQuery = dbQuery.lte("sent_at", `${endDate}T23:59:59.999Z`);
    }
    if (sender) {
      dbQuery = dbQuery.eq("sender_identifier", sender);
    }
    if (hasMedia === "true") {
      dbQuery = dbQuery.eq("has_media", true);
    } else if (hasMedia === "false") {
      dbQuery = dbQuery.eq("has_media", false);
    }
    if (conversationId) {
      dbQuery = dbQuery.eq("conversation_id", conversationId);
    }
    if (channelType && channelType !== "all") {
      dbQuery = dbQuery.eq("conversations.channel_type", channelType);
    }

    const { data: messages, error, count } = await dbQuery;

    if (error) {
      console.error("Error searching messages:", error);
      return NextResponse.json(
        { error: "Failed to search messages" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: messages || [],
      total: count || 0,
      page,
      page_size: limit,
      has_more: (count || 0) > offset + limit,
    });
  } catch (error) {
    console.error("Error in search API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
