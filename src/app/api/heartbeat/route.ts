import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { cookies } from "next/headers";

// POST /api/heartbeat - Update tenant's last activity timestamp
export async function POST() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Determine which tenant to update
    // For super admins: use viewingAsTenantId if set
    // For regular users: use their current tenant
    let tenantIdToUpdate = context.tenantId;

    if (context.role === "super_admin" && !tenantIdToUpdate) {
      // Super admin not viewing as tenant - check for viewingAsTenantId cookie directly
      const cookieStore = await cookies();
      const viewingAsTenantId = cookieStore.get("viewingAsTenantId")?.value;
      if (viewingAsTenantId) {
        tenantIdToUpdate = viewingAsTenantId;
      }
    }

    if (!tenantIdToUpdate) {
      // No tenant to update - this is fine for super admins at platform level
      return NextResponse.json({ success: true, message: "No tenant context" });
    }

    const supabase = createAdminClient();

    // Update tenant's last activity timestamp
    const { error } = await supabase
      .from("tenants")
      .update({ last_user_activity_at: new Date().toISOString() })
      .eq("id", tenantIdToUpdate);

    if (error) {
      console.error("Error updating tenant activity:", error);
      return NextResponse.json(
        { error: "Failed to update activity" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, tenantId: tenantIdToUpdate });
  } catch (error) {
    console.error("Error in heartbeat API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/heartbeat - Get current sync status (for displaying in UI)
export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated || !context.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Get tenant's sync info
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("last_sync_at, sync_enabled, last_user_activity_at")
      .eq("id", context.tenantId)
      .single();

    if (tenantError) {
      return NextResponse.json(
        { error: "Failed to get tenant info" },
        { status: 500 }
      );
    }

    // Get latest sync status
    const { data: syncStatus } = await supabase
      .from("sync_status")
      .select("status, last_sync_at, last_error")
      .eq("tenant_id", context.tenantId)
      .order("last_sync_at", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      last_sync_at: syncStatus?.last_sync_at || tenant?.last_sync_at,
      sync_enabled: tenant?.sync_enabled ?? true,
      sync_status: syncStatus?.status || "unknown",
      last_error: syncStatus?.last_error,
    });
  } catch (error) {
    console.error("Error in heartbeat GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
