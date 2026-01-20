import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = Math.min(parseInt(searchParams.get("page_size") || "20"), 50);
  const extensionNumber = searchParams.get("extension");
  const direction = searchParams.get("direction");
  const search = searchParams.get("search");

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
    const offset = (page - 1) * pageSize;

    // Build query
    let query = supabase
      .from("call_recordings")
      .select("*", { count: "exact" })
      .eq("tenant_id", context.tenantId)
      .order("recorded_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    // Filter by extension if specified
    if (extensionNumber) {
      query = query.eq("extension_number", extensionNumber);
    }

    // Filter by direction if specified
    if (direction) {
      query = query.eq("direction", direction);
    }

    // Search by caller/callee
    if (search) {
      query = query.or(`caller_number.ilike.%${search}%,callee_number.ilike.%${search}%,caller_name.ilike.%${search}%,callee_name.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Error fetching recordings:", error);
      return NextResponse.json(
        { error: "Failed to fetch recordings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      page_size: pageSize,
      has_more: (count || 0) > offset + pageSize,
    });
  } catch (error) {
    console.error("Error in recordings API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
