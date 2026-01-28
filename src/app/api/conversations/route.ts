import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

interface ConversationWithParticipants {
  id: string;
  is_group_chat: boolean;
  participants: Array<{
    extension_id: string | null;
    external_id: string | null;
    participant_identifier: string;
  }>;
  [key: string]: unknown;
}

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

    // Use admin client to bypass RLS after validating user access
    const supabase = createAdminClient();

    // Check if user is admin or super_admin (bypass permission filtering)
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

    // If admin, return all conversations without permission filtering
    if (bypassFiltering) {
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
    }

    // For regular users, apply permission-based filtering
    // Get user's permitted conversation IDs (stored in user_group_chat_permissions for all types)
    const { data: conversationPermissions } = await supabase
      .from("user_group_chat_permissions")
      .select("conversation_id")
      .eq("user_id", context.userId)
      .eq("tenant_id", context.tenantId);

    const permittedConversationIds = new Set(
      (conversationPermissions || []).map(p => p.conversation_id)
    );

    // Also check extension-based permissions (backward compatibility)
    const { data: extensionPermissions } = await supabase
      .from("user_extension_permissions")
      .select("extension_id, extensions(extension_number)")
      .eq("user_id", context.userId)
      .eq("tenant_id", context.tenantId);

    const permittedExtensionIds = new Set(
      (extensionPermissions || []).map(p => p.extension_id)
    );

    const permittedExtensionNumbers = new Set(
      (extensionPermissions || [])
        .map(p => {
          const ext = p.extensions as unknown as { extension_number: string } | null;
          return ext?.extension_number;
        })
        .filter((n): n is string => !!n)
    );

    // If no permissions at all, return empty
    if (permittedConversationIds.size === 0 && permittedExtensionIds.size === 0) {
      return NextResponse.json({
        data: [],
        total: 0,
        page,
        page_size: limit,
        has_more: false,
        message: "No conversations available. Contact your administrator for access."
      });
    }

    // Fetch all conversations (we'll filter in-memory)
    const { data: allConversations, error } = await supabase
      .from("conversations")
      .select(
        `
        *,
        participants (*)
      `
      )
      .eq("tenant_id", context.tenantId)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (error) {
      console.error("Error fetching conversations:", error);
      return NextResponse.json(
        { error: "Failed to fetch conversations" },
        { status: 500 }
      );
    }

    // Filter conversations based on permissions
    const filteredConversations = (allConversations as ConversationWithParticipants[] || []).filter(conv => {
      // Check direct conversation permission (works for both 1-on-1 and group chats)
      if (permittedConversationIds.has(conv.id)) {
        return true;
      }

      // Fallback: check extension-based permissions for 1-on-1 chats (backward compatibility)
      if (!conv.is_group_chat && conv.participants?.some(
        p => (p.extension_id && permittedExtensionIds.has(p.extension_id)) ||
             (p.external_id && permittedExtensionNumbers.has(p.external_id))
      )) {
        return true;
      }

      return false;
    });

    // Apply pagination
    const paginatedConversations = filteredConversations.slice(offset, offset + limit);
    const total = filteredConversations.length;

    return NextResponse.json({
      data: paginatedConversations,
      total,
      page,
      page_size: limit,
      has_more: total > offset + limit,
    });
  } catch (error) {
    console.error("Error in conversations API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
