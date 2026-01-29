import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface PermissionsPayload {
  extensionIds: string[];
  groupChatIds: string[];
}

// GET: Fetch user's current permissions
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id: targetUserId } = await params;
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Check if current user is admin or super_admin
    const { data: currentProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", context.userId)
      .single();

    const isSuperAdmin = currentProfile?.role === "super_admin";
    const isAdmin = currentProfile?.role === "admin" || isSuperAdmin;

    if (!isAdmin) {
      if (!context.tenantId) {
        return NextResponse.json({ error: "No tenant context" }, { status: 403 });
      }
      // Check if user is a tenant admin
      const { data: tenantRole } = await supabase
        .from("user_tenants")
        .select("role")
        .eq("user_id", context.userId)
        .eq("tenant_id", context.tenantId)
        .single();

      if (tenantRole?.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // For super admins without tenant context, get the user's first tenant
    // For regular admins, use the current tenant context
    let targetTenantId: string | null = context.tenantId;

    if (isSuperAdmin && !targetTenantId) {
      // Super admin without tenant context - get the user's first tenant
      const { data: userTenants } = await supabase
        .from("user_tenants")
        .select("tenant_id")
        .eq("user_id", targetUserId)
        .limit(1);

      if (!userTenants || userTenants.length === 0) {
        // User has no tenant, return empty permissions
        return NextResponse.json({
          extensionIds: [],
          groupChatIds: [],
        });
      }
      targetTenantId = userTenants[0].tenant_id;
    } else if (!isSuperAdmin && context.tenantId) {
      // Regular admin - verify target user belongs to this tenant
      const { data: targetTenant } = await supabase
        .from("user_tenants")
        .select("tenant_id")
        .eq("user_id", targetUserId)
        .eq("tenant_id", context.tenantId)
        .single();

      if (!targetTenant) {
        return NextResponse.json({ error: "User not found in this tenant" }, { status: 404 });
      }
    }

    if (!targetTenantId) {
      return NextResponse.json({ error: "No tenant context available" }, { status: 403 });
    }

    // Get user's extension permissions
    const { data: extensionPermissions } = await supabase
      .from("user_extension_permissions")
      .select("extension_id")
      .eq("user_id", targetUserId)
      .eq("tenant_id", targetTenantId);

    // Get user's group chat permissions
    const { data: groupChatPermissions } = await supabase
      .from("user_group_chat_permissions")
      .select("conversation_id")
      .eq("user_id", targetUserId)
      .eq("tenant_id", targetTenantId);

    return NextResponse.json({
      extensionIds: (extensionPermissions || []).map(p => p.extension_id),
      groupChatIds: (groupChatPermissions || []).map(p => p.conversation_id),
    });
  } catch (error) {
    console.error("Error fetching user permissions:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: Update user's permissions (bulk replace)
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id: targetUserId } = await params;
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Check if current user is admin or super_admin
    const { data: currentProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", context.userId)
      .single();

    const isSuperAdmin = currentProfile?.role === "super_admin";
    const isAdmin = currentProfile?.role === "admin" || isSuperAdmin;

    if (!isAdmin) {
      if (!context.tenantId) {
        return NextResponse.json({ error: "No tenant context" }, { status: 403 });
      }
      // Check if user is a tenant admin
      const { data: tenantRole } = await supabase
        .from("user_tenants")
        .select("role")
        .eq("user_id", context.userId)
        .eq("tenant_id", context.tenantId)
        .single();

      if (tenantRole?.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // For super admins without tenant context, get the user's first tenant
    // For regular admins, use the current tenant context
    let targetTenantId: string | null = context.tenantId;

    if (isSuperAdmin && !targetTenantId) {
      // Super admin without tenant context - get the user's first tenant
      const { data: userTenants } = await supabase
        .from("user_tenants")
        .select("tenant_id")
        .eq("user_id", targetUserId)
        .limit(1);

      if (!userTenants || userTenants.length === 0) {
        return NextResponse.json({ error: "User has no tenant access" }, { status: 400 });
      }
      targetTenantId = userTenants[0].tenant_id;
    } else if (!isSuperAdmin && context.tenantId) {
      // Regular admin - verify target user belongs to this tenant
      const { data: targetTenant } = await supabase
        .from("user_tenants")
        .select("tenant_id")
        .eq("user_id", targetUserId)
        .eq("tenant_id", context.tenantId)
        .single();

      if (!targetTenant) {
        return NextResponse.json({ error: "User not found in this tenant" }, { status: 404 });
      }
    }

    if (!targetTenantId) {
      return NextResponse.json({ error: "No tenant context available" }, { status: 403 });
    }

    const body: PermissionsPayload = await request.json();
    const { extensionIds = [], groupChatIds = [] } = body;

    // Delete existing extension permissions for this user/tenant
    const { error: delExtError } = await supabase
      .from("user_extension_permissions")
      .delete()
      .eq("user_id", targetUserId)
      .eq("tenant_id", targetTenantId);

    if (delExtError) {
      console.error("Error deleting extension permissions:", delExtError);
      return NextResponse.json({ error: `Failed to clear extension permissions: ${delExtError.message}` }, { status: 500 });
    }

    // Insert new extension permissions
    if (extensionIds.length > 0) {
      const extensionPermissions = extensionIds.map(extensionId => ({
        user_id: targetUserId,
        tenant_id: targetTenantId,
        extension_id: extensionId,
        created_by: context.userId,
      }));

      const { error: extError } = await supabase
        .from("user_extension_permissions")
        .insert(extensionPermissions);

      if (extError) {
        console.error("Error inserting extension permissions:", extError);
        return NextResponse.json({ error: `Failed to save extension permissions: ${extError.message}` }, { status: 500 });
      }
    }

    // Delete existing group chat permissions for this user/tenant
    const { error: delChatError } = await supabase
      .from("user_group_chat_permissions")
      .delete()
      .eq("user_id", targetUserId)
      .eq("tenant_id", targetTenantId);

    if (delChatError) {
      console.error("Error deleting group chat permissions:", delChatError);
      return NextResponse.json({ error: `Failed to clear group chat permissions: ${delChatError.message}` }, { status: 500 });
    }

    // Insert new group chat permissions
    if (groupChatIds.length > 0) {
      const groupChatPermissions = groupChatIds.map(conversationId => ({
        user_id: targetUserId,
        tenant_id: targetTenantId,
        conversation_id: conversationId,
        created_by: context.userId,
      }));

      const { error: chatError } = await supabase
        .from("user_group_chat_permissions")
        .insert(groupChatPermissions);

      if (chatError) {
        console.error("Error inserting group chat permissions:", chatError);
        return NextResponse.json({ error: `Failed to save group chat permissions: ${chatError.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      extensionCount: extensionIds.length,
      groupChatCount: groupChatIds.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error updating user permissions:", message, error);
    return NextResponse.json({ error: `Failed to save permissions: ${message}` }, { status: 500 });
  }
}
