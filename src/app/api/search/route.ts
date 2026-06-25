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

    // Step 1: Get all conversations for this tenant (applying channel filter here)
    // This avoids complex !inner join + embedded resource filter issues
    let convQuery = supabase
      .from("conversations")
      .select("id, conversation_name, channel_type, threecx_conversation_id")
      .eq("tenant_id", context.tenantId);

    if (channelType && channelType !== "all") {
      convQuery = convQuery.eq("channel_type", channelType);
    }

    const { data: tenantConvs, error: convError } = await convQuery;

    if (convError) {
      console.error("Error fetching conversations for search:", convError);
      return NextResponse.json({ error: "Failed to search" }, { status: 500 });
    }

    const convMap = new Map((tenantConvs || []).map(c => [c.id, c]));
    const allConvIds = Array.from(convMap.keys());

    if (allConvIds.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, page_size: limit, has_more: false });
    }

    // If filtering by a specific conversation, validate it belongs to this tenant
    const targetConvId = conversationId && convMap.has(conversationId) ? conversationId : null;

    // Step 2: Build messages query using direct IN filter — no join complexity
    let dbQuery = supabase
      .from("messages")
      .select(`*, media_files (*)`, { count: "exact" })
      .order("sent_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (targetConvId) {
      dbQuery = dbQuery.eq("conversation_id", targetConvId);
    } else {
      dbQuery = dbQuery.in("conversation_id", allConvIds);
    }

    // Text search: messages content/sender AND conversation names
    if (query && query.trim()) {
      const q = query.trim();
      const qLower = q.toLowerCase();

      // Find conversations whose name contains the query
      const nameMatchIds = (tenantConvs || [])
        .filter(c => c.conversation_name?.toLowerCase().includes(qLower))
        .map(c => c.id);

      const orParts = [
        `content.ilike.%${q}%`,
        `sender_name.ilike.%${q}%`,
        `sender_identifier.ilike.%${q}%`,
      ];

      // Include messages from name-matched conversations in the OR
      if (nameMatchIds.length > 0) {
        orParts.push(`conversation_id.in.(${nameMatchIds.join(",")})`);
      }

      dbQuery = dbQuery.or(orParts.join(","));
    }

    // Date filters
    if (startDate) dbQuery = dbQuery.gte("sent_at", `${startDate}T00:00:00.000Z`);
    if (endDate) dbQuery = dbQuery.lte("sent_at", `${endDate}T23:59:59.999Z`);

    // Sender filter — exact extension_number match (matches dropdown value)
    if (sender) dbQuery = dbQuery.eq("sender_identifier", sender);

    // Media filter
    if (hasMedia === "true") dbQuery = dbQuery.eq("has_media", true);
    else if (hasMedia === "false") dbQuery = dbQuery.eq("has_media", false);

    const { data: messages, error, count } = await dbQuery;

    if (error) {
      console.error("Error searching messages:", error);
      return NextResponse.json({ error: "Failed to search messages" }, { status: 500 });
    }

    // Enrich with conversation metadata for display
    const enrichedMessages = (messages || []).map(m => ({
      ...m,
      conversations: convMap.get(m.conversation_id) || null,
    }));

    return NextResponse.json({
      data: enrichedMessages,
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
