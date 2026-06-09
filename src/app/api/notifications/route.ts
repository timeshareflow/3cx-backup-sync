import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId && context.role !== "super_admin") {
      return NextResponse.json({ error: "No tenant access" }, { status: 403 });
    }

    const supabase = createAdminClient();

    const tenantFilter = context.tenantId;

    // Fetch in parallel: unread voicemails + sync errors
    const [voicemailResult, syncStatusResult] = await Promise.all([
      // Unread voicemails — most recent 8, filtered to real voicemails (not system files)
      tenantFilter
        ? supabase
            .from("voicemails")
            .select("id, caller_name, caller_number, received_at, duration_seconds, extension_number")
            .eq("tenant_id", tenantFilter)
            .eq("is_read", false)
            .like("threecx_voicemail_id", "vmail_%")
            .order("received_at", { ascending: false })
            .limit(8)
        : Promise.resolve({ data: [], error: null, count: 0 }),

      // Sync errors — any data type currently in error state
      tenantFilter
        ? supabase
            .from("sync_status")
            .select("sync_type, status, last_error, last_success_at, tenant_id")
            .eq("tenant_id", tenantFilter)
            .eq("status", "error")
            .order("sync_type")
        : supabase
            .from("sync_status")
            .select("sync_type, status, last_error, last_success_at, tenant_id")
            .eq("status", "error")
            .order("sync_type"),
    ]);

    // Count unread voicemails separately for badge accuracy
    const { count: unreadCount } = tenantFilter
      ? await supabase
          .from("voicemails")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantFilter)
          .eq("is_read", false)
          .like("threecx_voicemail_id", "vmail_%")
      : { count: 0 };

    const syncErrors = (syncStatusResult.data || []).map((row) => ({
      sync_type: row.sync_type,
      last_error: row.last_error,
      last_success_at: row.last_success_at,
    }));

    return NextResponse.json({
      voicemails: {
        unread_count: unreadCount ?? 0,
        recent: voicemailResult.data || [],
      },
      sync_errors: syncErrors,
      total_unread: (unreadCount ?? 0) + syncErrors.length,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/notifications — mark all voicemails as read
export async function PATCH() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant access" }, { status: 403 });
    }

    const supabase = createAdminClient();

    await supabase
      .from("voicemails")
      .update({ is_read: true })
      .eq("tenant_id", context.tenantId)
      .eq("is_read", false)
      .like("threecx_voicemail_id", "vmail_%");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marking notifications read:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
