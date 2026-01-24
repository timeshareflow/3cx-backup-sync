import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const includeLogs = searchParams.get("include_logs") === "true";

  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use admin client to bypass RLS after validating user access
    const supabase = createAdminClient();

    // Get sync status for tenant (or all if super_admin with no tenant selected)
    let syncStatusQuery = supabase
      .from("sync_status")
      .select("*")
      .order("sync_type");

    if (context.tenantId) {
      syncStatusQuery = syncStatusQuery.eq("tenant_id", context.tenantId);
    }

    const { data: syncStatus, error: statusError } = await syncStatusQuery;

    if (statusError) {
      console.error("Error fetching sync status:", statusError);
      return NextResponse.json(
        { error: "Failed to fetch sync status" },
        { status: 500 }
      );
    }

    // Get stats for current tenant
    let conversationQuery = supabase.from("conversations").select("*", { count: "exact", head: true });
    let messageQuery = supabase.from("messages").select("*", { count: "exact", head: true });
    let mediaQuery = supabase.from("media_files").select("*", { count: "exact", head: true });
    let extensionQuery = supabase.from("extensions").select("*", { count: "exact", head: true });

    if (context.tenantId) {
      conversationQuery = conversationQuery.eq("tenant_id", context.tenantId);
      extensionQuery = extensionQuery.eq("tenant_id", context.tenantId);
      // Messages and media are filtered through conversation join for tenant
    }

    const [
      { count: conversationCount },
      { count: messageCount },
      { count: mediaCount },
      { count: extensionCount },
    ] = await Promise.all([
      conversationQuery,
      messageQuery,
      mediaQuery,
      extensionQuery,
    ]);

    const response: {
      sync_status: typeof syncStatus;
      stats: {
        total_conversations: number;
        total_messages: number;
        total_media: number;
        total_extensions: number;
      };
      logs?: unknown[];
    } = {
      sync_status: syncStatus || [],
      stats: {
        total_conversations: conversationCount || 0,
        total_messages: messageCount || 0,
        total_media: mediaCount || 0,
        total_extensions: extensionCount || 0,
      },
    };

    // Optionally include recent logs
    if (includeLogs) {
      let logsQuery = supabase
        .from("sync_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(50);

      if (context.tenantId) {
        logsQuery = logsQuery.eq("tenant_id", context.tenantId);
      }

      const { data: logs } = await logsQuery;
      response.logs = logs || [];
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in sync status API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
