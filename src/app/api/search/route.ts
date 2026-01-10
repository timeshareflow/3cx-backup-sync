import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

  if (!query || query.trim().length < 2) {
    return NextResponse.json(
      { error: "Search query must be at least 2 characters" },
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

    const supabase = await createClient();

    // Build the search query with tenant filter via conversations join
    let dbQuery = supabase
      .from("messages")
      .select(
        `
        *,
        media_files (*),
        conversations!inner (id, conversation_name, threecx_conversation_id, tenant_id)
      `,
        { count: "exact" }
      )
      .eq("conversations.tenant_id", context.tenantId)
      .textSearch("search_vector", query, {
        type: "websearch",
        config: "english",
      })
      .order("sent_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (startDate) {
      dbQuery = dbQuery.gte("sent_at", startDate);
    }
    if (endDate) {
      dbQuery = dbQuery.lte("sent_at", endDate);
    }
    if (sender) {
      dbQuery = dbQuery.eq("sender_extension", sender);
    }
    if (hasMedia === "true") {
      dbQuery = dbQuery.eq("has_media", true);
    } else if (hasMedia === "false") {
      dbQuery = dbQuery.eq("has_media", false);
    }
    if (conversationId) {
      dbQuery = dbQuery.eq("conversation_id", conversationId);
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
