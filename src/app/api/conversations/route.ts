import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = (page - 1) * limit;

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
        message: "No tenant access. Please contact your administrator."
      });
    }

    const supabase = await createClient();

    // Get conversations with participants, filtered by tenant
    const { data: conversations, error, count } = await supabase
      .from("conversations")
      .select(
        `
        *,
        participants (*)
      `,
        { count: "exact" }
      )
      .eq("tenant_id", context.tenantId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching conversations:", error);
      return NextResponse.json(
        { error: "Failed to fetch conversations" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: conversations || [],
      total: count || 0,
      page,
      page_size: limit,
      has_more: (count || 0) > offset + limit,
    });
  } catch (error) {
    console.error("Error in conversations API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
