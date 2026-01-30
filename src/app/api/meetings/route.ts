import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = Math.min(parseInt(searchParams.get("page_size") || "20"), 50);
  const hostExtension = searchParams.get("host_extension");
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

    // Check feature permission for non-admins
    if (!bypassFiltering) {
      const { data: featurePerms } = await supabase
        .from("user_feature_permissions")
        .select("can_view_meetings")
        .eq("user_id", context.userId)
        .eq("tenant_id", context.tenantId)
        .single();

      if (!featurePerms || !featurePerms.can_view_meetings) {
        return NextResponse.json({
          data: [],
          total: 0,
          page,
          page_size: pageSize,
          has_more: false,
          message: "Meeting access is not enabled. Contact your administrator.",
        });
      }
    }

    // Build query - use uploaded_at for ordering as it's the default timestamp
    // recorded_at may not exist on older table versions
    let query = supabase
      .from("meeting_recordings")
      .select("*", { count: "exact" })
      .eq("tenant_id", context.tenantId)
      .order("uploaded_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    // Filter by host extension if specified
    if (hostExtension) {
      query = query.eq("host_extension", hostExtension);
    }

    // Search by meeting name or host
    if (search) {
      query = query.or(`meeting_name.ilike.%${search}%,meeting_host.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("[meetings API] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch meetings", details: error.message },
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
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
