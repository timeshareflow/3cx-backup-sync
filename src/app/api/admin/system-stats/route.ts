import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Use admin client to bypass RLS after validating user access
    const supabase = createAdminClient();

    // Fetch system stats
    const [tenantsResult, usersResult, conversationsResult, messagesResult, mediaResult, syncResult] = await Promise.all([
      supabase.from("tenants").select("id", { count: "exact", head: true }),
      supabase.from("user_profiles").select("id", { count: "exact", head: true }),
      supabase.from("conversations").select("id", { count: "exact", head: true }),
      supabase.from("messages").select("id", { count: "exact", head: true }),
      supabase.from("media_files").select("id, file_size", { count: "exact" }),
      supabase.from("sync_logs").select("*").order("started_at", { ascending: false }).limit(1),
    ]);

    const totalStorageBytes = mediaResult.data?.reduce((acc, file) => acc + (file.file_size || 0), 0) || 0;

    const lastSync = syncResult.data?.[0];
    const syncStatus = lastSync?.status === "running" ? "running" :
                       lastSync?.status === "failed" ? "error" : "idle";

    return NextResponse.json({
      totalTenants: tenantsResult.count || 0,
      totalUsers: usersResult.count || 0,
      totalConversations: conversationsResult.count || 0,
      totalMessages: messagesResult.count || 0,
      totalMediaFiles: mediaResult.count || 0,
      storageUsedMB: totalStorageBytes / (1024 * 1024),
      lastSyncTime: lastSync?.started_at || null,
      syncStatus,
    });
  } catch (error) {
    console.error("Error fetching system stats:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
