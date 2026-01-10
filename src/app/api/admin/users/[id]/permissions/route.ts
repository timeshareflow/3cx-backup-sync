import { createClient } from "@/lib/supabase/server";
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

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant context" }, { status: 403 });
    }

    const supabase = await createClient();

    // Check if current user is admin or super_admin
    const { data: currentProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", context.userId)
      .single();

    const isAdmin = currentProfile?.role === "admin" || currentProfile?.role === "super_admin";

    if (!isAdmin) {
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

    // Verify target user belongs to this tenant
    const { data: targetTenant } = await supabase
      .from("user_tenants")
      .select("tenant_id")
      .eq("user_id", targetUserId)
      .eq("tenant_id", context.tenantId)
      .single();

    if (!targetTenant) {
      return NextResponse.json({ error: "User not found in this tenant" }, { status: 404 });
    }

    // Get user's extension permissions
    const { data: extensionPermissions } = await supabase
      .from("user_extension_permissions")
      .select("extension_id")
      .eq("user_id", targetUserId)
      .eq("tenant_id", context.tenantId);

    // Get user's group chat permissions
    const { data: groupChatPermissions } = await supabase
      .from("user_group_chat_permissions")
      .select("conversation_id")
      .eq("user_id", targetUserId)
      .eq("tenant_id", context.tenantId);

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

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant context" }, { status: 403 });
    }

    const supabase = await createClient();

    // Check if current user is admin or super_admin
    const { data: currentProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", context.userId)
      .single();

    const isSuperAdmin = currentProfile?.role === "super_admin";
    const isAdmin = currentProfile?.role === "admin" || isSuperAdmin;

    if (!isAdmin) {
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

    // Verify target user belongs to this tenant
    const { data: targetTenant } = await supabase
      .from("user_tenants")
      .select("tenant_id")
      .eq("user_id", targetUserId)
      .eq("tenant_id", context.tenantId)
      .single();

    if (!targetTenant) {
      return NextResponse.json({ error: "User not found in this tenant" }, { status: 404 });
    }

    const body: PermissionsPayload = await request.json();
    const { extensionIds = [], groupChatIds = [] } = body;

    // Delete existing extension permissions for this user/tenant
    await supabase
      .from("user_extension_permissions")
      .delete()
      .eq("user_id", targetUserId)
      .eq("tenant_id", context.tenantId);

    // Insert new extension permissions
    if (extensionIds.length > 0) {
      const extensionPermissions = extensionIds.map(extensionId => ({
        user_id: targetUserId,
        tenant_id: context.tenantId,
        extension_id: extensionId,
        created_by: context.userId,
      }));

      const { error: extError } = await supabase
        .from("user_extension_permissions")
        .insert(extensionPermissions);

      if (extError) {
        console.error("Error inserting extension permissions:", extError);
        throw extError;
      }
    }

    // Delete existing group chat permissions for this user/tenant
    await supabase
      .from("user_group_chat_permissions")
      .delete()
      .eq("user_id", targetUserId)
      .eq("tenant_id", context.tenantId);

    // Insert new group chat permissions
    if (groupChatIds.length > 0) {
      const groupChatPermissions = groupChatIds.map(conversationId => ({
        user_id: targetUserId,
        tenant_id: context.tenantId,
        conversation_id: conversationId,
        created_by: context.userId,
      }));

      const { error: chatError } = await supabase
        .from("user_group_chat_permissions")
        .insert(groupChatPermissions);

      if (chatError) {
        console.error("Error inserting group chat permissions:", chatError);
        throw chatError;
      }
    }

    return NextResponse.json({
      success: true,
      extensionCount: extensionIds.length,
      groupChatCount: groupChatIds.length,
    });
  } catch (error) {
    console.error("Error updating user permissions:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
