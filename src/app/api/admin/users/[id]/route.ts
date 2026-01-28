import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";
import { logUserAction } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Update user profile
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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
    const isEditingSelf = id === context.userId;

    // Allow users to edit their own profile, or require admin rights to edit others
    if (!isEditingSelf && !isSuperAdmin && !isTenantAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if target user is protected (but allow self-editing)
    const { data: targetUser } = await supabase
      .from("user_profiles")
      .select("is_protected")
      .eq("id", id)
      .single();

    if (targetUser?.is_protected && !isEditingSelf) {
      return NextResponse.json({ error: "Cannot modify protected user" }, { status: 403 });
    }

    // Check target user's tenant role if not super admin

    if (!isSuperAdmin && !isEditingSelf && context.tenantId) {
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

    // Get old values for audit log
    const { data: oldProfile } = await supabase
      .from("user_profiles")
      .select("full_name, email")
      .eq("id", id)
      .single();

    const { error } = await supabase
      .from("user_profiles")
      .update(updateData)
      .eq("id", id);

    if (error) {
      throw error;
    }

    // Log audit event
    await logUserAction("user.updated", id, {
      userId: context.userId,
      tenantId: context.tenantId,
      request,
      oldValues: oldProfile || undefined,
      newValues: { full_name, email: email?.toLowerCase() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    // Check if target user is protected and get user info for audit
    const { data: targetUser } = await supabase
      .from("user_profiles")
      .select("is_protected, email, full_name")
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
      // Clean up all related records first to avoid FK constraint issues

      // Clear created_by references (these don't have onDelete cascade)
      await supabase
        .from("user_extension_permissions")
        .update({ created_by: null })
        .eq("created_by", id);

      await supabase
        .from("user_group_chat_permissions")
        .update({ created_by: null })
        .eq("created_by", id);

      // Delete from child tables explicitly
      await supabase.from("impersonation_sessions").delete().or(`super_admin_id.eq.${id},impersonated_user_id.eq.${id}`);
      await supabase.from("user_push_tokens").delete().eq("user_id", id);
      await supabase.from("user_notification_preferences").delete().eq("user_id", id);
      await supabase.from("user_group_chat_permissions").delete().eq("user_id", id);
      await supabase.from("user_extension_permissions").delete().eq("user_id", id);
      await supabase.from("user_tenants").delete().eq("user_id", id);

      // Nullify audit log references (set null on delete)
      await supabase.from("audit_logs").update({ user_id: null }).eq("user_id", id);
      await supabase.from("notification_logs").update({ user_id: null }).eq("user_id", id);

      // Delete from user_profiles
      const { error } = await supabase
        .from("user_profiles")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting user profile:", error);
        throw error;
      }

      // Delete from Supabase Auth last (profile FK reference is gone now)
      const { error: authError } = await supabase.auth.admin.deleteUser(id);
      if (authError) {
        console.error("Error deleting user from Auth:", authError);
        // Profile already deleted, auth cleanup is best-effort
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

      // Clean up orphaned user - if user no longer belongs to any tenant, delete completely
      const { data: remainingTenants } = await supabase
        .from("user_tenants")
        .select("id")
        .eq("user_id", id)
        .limit(1);

      if (!remainingTenants || remainingTenants.length === 0) {
        // User is no longer in any tenant - fully clean up

        // Clear created_by references
        await supabase
          .from("user_extension_permissions")
          .update({ created_by: null })
          .eq("created_by", id);
        await supabase
          .from("user_group_chat_permissions")
          .update({ created_by: null })
          .eq("created_by", id);

        // Delete remaining child records
        await supabase.from("impersonation_sessions").delete().or(`super_admin_id.eq.${id},impersonated_user_id.eq.${id}`);
        await supabase.from("user_push_tokens").delete().eq("user_id", id);
        await supabase.from("user_notification_preferences").delete().eq("user_id", id);
        await supabase.from("audit_logs").update({ user_id: null }).eq("user_id", id);
        await supabase.from("notification_logs").update({ user_id: null }).eq("user_id", id);

        // Delete the profile first, then auth
        await supabase.from("user_profiles").delete().eq("id", id);

        const { error: authError } = await supabase.auth.admin.deleteUser(id);
        if (authError) {
          console.error("Error deleting orphaned user from Auth:", authError);
        }
      }
    }

    // Log audit event
    await logUserAction("user.deleted", id, {
      userId: context.userId,
      tenantId: context.tenantId,
      request,
      oldValues: {
        email: targetUser?.email,
        full_name: targetUser?.full_name,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
