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

    // Get permitted extensions for recordings (if not admin)
    let permittedExtensionNumbers: Set<string> | null = null;

    if (!bypassFiltering) {
      // Get extensions user has recording access to
      const { data: extensionPermissions } = await supabase
        .from("user_extension_permissions")
        .select("extension_id, can_access_recordings, extensions(extension_number)")
        .eq("user_id", context.userId)
        .eq("tenant_id", context.tenantId)
        .eq("can_access_recordings", true);

      if (!extensionPermissions || extensionPermissions.length === 0) {
        // User has no recording permissions
        return NextResponse.json({
          data: [],
          total: 0,
          page,
          page_size: pageSize,
          has_more: false,
          message: "No recording access. Contact your administrator.",
        });
      }

      permittedExtensionNumbers = new Set(
        extensionPermissions
          .map((p) => {
            const ext = p.extensions as unknown as { extension_number: string } | null;
            return ext?.extension_number;
          })
          .filter((n): n is string => !!n)
      );
    }

    // Build query
    let query = supabase
      .from("call_recordings")
      .select("*", { count: "exact" })
      .eq("tenant_id", context.tenantId)
      .order("started_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    // Filter by permitted extensions if not admin
    if (permittedExtensionNumbers && permittedExtensionNumbers.size > 0) {
      const extArray = Array.from(permittedExtensionNumbers);
      query = query.in("extension_number", extArray);
    }

    // Filter by extension if specified (and user has access)
    if (extensionNumber) {
      if (permittedExtensionNumbers && !permittedExtensionNumbers.has(extensionNumber)) {
        return NextResponse.json({
          data: [],
          total: 0,
          page,
          page_size: pageSize,
          has_more: false,
          message: "No access to this extension's recordings.",
        });
      }
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
      // Check for common errors
      if (error.code === "42P01") {
        // Table doesn't exist - return empty data instead of error
        return NextResponse.json({
          data: [],
          total: 0,
          page,
          page_size: pageSize,
          has_more: false,
          message: "Call recordings table not yet created. Run migrations first.",
        });
      }
      return NextResponse.json(
        { error: `Failed to fetch recordings: ${error.message}` },
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
