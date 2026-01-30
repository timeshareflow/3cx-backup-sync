import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = Math.min(parseInt(searchParams.get("page_size") || "20"), 50);
  const extensionNumber = searchParams.get("extension");
  const isRead = searchParams.get("is_read");
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
        .select("can_view_voicemails")
        .eq("user_id", context.userId)
        .eq("tenant_id", context.tenantId)
        .single();

      if (!featurePerms || !featurePerms.can_view_voicemails) {
        return NextResponse.json({
          data: [],
          total: 0,
          page,
          page_size: pageSize,
          has_more: false,
          message: "Voicemail access is not enabled. Contact your administrator.",
        });
      }
    }

    // Build query
    let query = supabase
      .from("voicemails")
      .select("*", { count: "exact" })
      .eq("tenant_id", context.tenantId)
      .order("received_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    // Filter by extension if specified
    if (extensionNumber) {
      query = query.eq("extension_number", extensionNumber);
    }

    // Filter by read status if specified
    if (isRead !== null && isRead !== undefined) {
      query = query.eq("is_read", isRead === "true");
    }

    // Search by caller
    if (search) {
      query = query.or(`caller_number.ilike.%${search}%,caller_name.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Error fetching voicemails:", error);
      if (error.code === "42P01") {
        return NextResponse.json({
          data: [],
          total: 0,
          page,
          page_size: pageSize,
          has_more: false,
        });
      }
      return NextResponse.json(
        { error: `Failed to fetch voicemails: ${error.message}` },
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
    console.error("Error in voicemails API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
