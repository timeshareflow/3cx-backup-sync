import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Update user profile
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { full_name, email } = await request.json();
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
      .select("is_protected")
      .eq("id", id)
      .single();

    if (targetUser?.is_protected) {
      return NextResponse.json({ error: "Cannot modify protected user" }, { status: 403 });
    }

    // Check target user's tenant role if not super admin
    if (!isSuperAdmin && context.tenantId) {
      const { data: targetTenantRole } = await supabase
        .from("user_tenants")
        .select("role")
        .eq("user_id", id)
        .eq("tenant_id", context.tenantId)
        .single();

      // Prevent tenant admins from modifying other admins
      if (targetTenantRole?.role === "admin") {
        return NextResponse.json({ error: "Cannot modify another admin" }, { status: 403 });
      }
    }

    // Update user profile
    const updateData: { full_name?: string; email?: string; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };

    if (full_name !== undefined) {
      updateData.full_name = full_name;
    }

    if (email !== undefined) {
      updateData.email = email.toLowerCase();
    }

    const { error } = await supabase
      .from("user_profiles")
      .update(updateData)
      .eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
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
      .select("is_protected")
      .eq("id", id)
      .single();

    if (targetUser?.is_protected) {
      return NextResponse.json({ error: "Cannot delete protected user" }, { status: 403 });
    }

    // Check target user's tenant role if not super admin
    if (!isSuperAdmin && context.tenantId) {
      const { data: targetTenantRole } = await supabase
        .from("user_tenants")
        .select("role")
        .eq("user_id", id)
        .eq("tenant_id", context.tenantId)
        .single();

      // Prevent tenant admins from deleting other admins
      if (targetTenantRole?.role === "admin") {
        return NextResponse.json({ error: "Cannot delete another admin" }, { status: 403 });
      }
    }

    if (isSuperAdmin) {
      // Super admin can fully delete users
      const { error } = await supabase
        .from("user_profiles")
        .delete()
        .eq("id", id);

      if (error) {
        throw error;
      }
    } else if (context.tenantId) {
      // Tenant admins can only remove users from their tenant
      const { error } = await supabase
        .from("user_tenants")
        .delete()
        .eq("user_id", id)
        .eq("tenant_id", context.tenantId);

      if (error) {
        throw error;
      }

      // Also delete related permissions
      await supabase
        .from("user_extension_permissions")
        .delete()
        .eq("user_id", id)
        .eq("tenant_id", context.tenantId);

      await supabase
        .from("user_group_chat_permissions")
        .delete()
        .eq("user_id", id)
        .eq("tenant_id", context.tenantId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
