import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Set trigger_requested_at for all sync types for this tenant
    // The sync service will check this and run immediately if recent
    const { error } = await supabase
      .from("sync_status")
      .update({
        trigger_requested_at: new Date().toISOString(),
      })
      .eq("tenant_id", context.tenantId);

    if (error) {
      console.error("Error triggering sync:", error);
      return NextResponse.json(
        { error: "Failed to trigger sync" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Sync triggered - the sync service will run shortly",
    });
  } catch (error) {
    console.error("Error in sync trigger API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
