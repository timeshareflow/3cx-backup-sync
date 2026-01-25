import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { role } = await request.json();
    const context = await getTenantContext();

    if (!context.isAuthenticated || !context.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Get current user's profile and tenant role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", context.userId)
      .single();

    const isSuperAdmin = profile?.role === "super_admin";

    // Check tenant role if not super admin
    let currentUserTenantRole: string | null = null;
    if (!isSuperAdmin && context.tenantId) {
      const { data: tenantRole } = await supabase
        .from("user_tenants")
        .select("role")
        .eq("user_id", context.userId)
        .eq("tenant_id", context.tenantId)
        .single();
      currentUserTenantRole = tenantRole?.role || null;
    }

    const isTenantAdmin = currentUserTenantRole === "admin";

    if (!isSuperAdmin && !isTenantAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if target user is protected
    const { data: targetUser } = await supabase
      .from("user_profiles")
      .select("is_protected, role")
      .eq("id", id)
      .single();

    if (targetUser?.is_protected) {
      return NextResponse.json({ error: "Cannot modify protected user's role" }, { status: 403 });
    }

    // Get target user's tenant role
    let targetTenantRole: string | null = null;
    if (context.tenantId) {
      const { data: targetTenant } = await supabase
        .from("user_tenants")
        .select("role")
        .eq("user_id", id)
        .eq("tenant_id", context.tenantId)
        .single();
      targetTenantRole = targetTenant?.role || null;
    }

    // Prevent tenant admins from modifying other admins
    if (!isSuperAdmin && targetTenantRole === "admin") {
      return NextResponse.json({ error: "Cannot modify another admin's role" }, { status: 403 });
    }

    // Update user's tenant role (not global role)
    if (context.tenantId) {
      const { error } = await supabase
        .from("user_tenants")
        .update({ role })
        .eq("user_id", id)
        .eq("tenant_id", context.tenantId);

      if (error) {
        throw error;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating user role:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
