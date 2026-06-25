import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { withRateLimit } from "@/lib/api-utils";
import { rateLimitConfigs } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimited = withRateLimit(request, rateLimitConfigs.search);
  if (rateLimited) return rateLimited;

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = (page - 1) * limit;

  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");
  const sender = searchParams.get("sender");
  const hasMedia = searchParams.get("has_media");
  const conversationId = searchParams.get("conversation_id");
  const channelType = searchParams.get("channel_type");

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
      return NextResponse.json({ data: [], total: 0, page, page_size: limit, has_more: false });
    }

    const supabase = createAdminClient();
    const q = query?.trim() || "";

    // If searching by conversation name, get those IDs first (small targeted query)
    let convNameMatchIds: string[] = [];
    if (q) {
      const { data: nameMatches } = await supabase
        .from("conversations")
        .select("id")
        .eq("tenant_id", context.tenantId)
        .ilike("conversation_name", `%${q}%`)
        .limit(200);
      convNameMatchIds = (nameMatches || []).map((c: { id: string }) => c.id);
    }

    // Main query — use !inner join to scope to this tenant without a large IN list
    let dbQuery = supabase
      .from("messages")
      .select(
        `*, conversations!inner(id, conversation_name, channel_type, threecx_conversation_id, is_external, is_group_chat), media_files(*)`,
        { count: "exact" }
      )
      .eq("conversations.tenant_id", context.tenantId)
      .order("sent_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Scope to a specific conversation if requested (and validate it belongs to this tenant)
    if (conversationId) {
      dbQuery = dbQuery.eq("conversation_id", conversationId);
    }

    // Channel filter applied on the joined conversations table
    if (channelType && channelType !== "all") {
      dbQuery = dbQuery.eq("conversations.channel_type", channelType);
    }

    // Text search: message content/sender OR conversation name match
    if (q) {
      const orParts = [
        `content.ilike.%${q}%`,
        `sender_name.ilike.%${q}%`,
        `sender_identifier.ilike.%${q}%`,
      ];
      if (convNameMatchIds.length > 0) {
        orParts.push(`conversation_id.in.(${convNameMatchIds.join(",")})`);
      }
      dbQuery = dbQuery.or(orParts.join(","));
    }

    // Date filters
    if (startDate) dbQuery = dbQuery.gte("sent_at", `${startDate}T00:00:00.000Z`);
    if (endDate) dbQuery = dbQuery.lte("sent_at", `${endDate}T23:59:59.999Z`);

    // Sender filter
    if (sender) dbQuery = dbQuery.eq("sender_identifier", sender);

    // Media filter
    if (hasMedia === "true") dbQuery = dbQuery.eq("has_media", true);
    else if (hasMedia === "false") dbQuery = dbQuery.eq("has_media", false);

    const { data: messages, error, count } = await dbQuery;

    if (error) {
      console.error("Error searching messages:", error);
      return NextResponse.json({ error: "Failed to search messages" }, { status: 500 });
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
