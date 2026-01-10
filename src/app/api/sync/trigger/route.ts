import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    // Update sync status to indicate a manual trigger was requested
    // The actual sync service will pick this up and run
    const { error } = await supabase
      .from("sync_status")
      .update({
        status: "running",
        last_sync_at: new Date().toISOString(),
      })
      .eq("sync_type", "messages");

    if (error) {
      console.error("Error triggering sync:", error);
      return NextResponse.json(
        { error: "Failed to trigger sync" },
        { status: 500 }
      );
    }

    // Note: In production, you might want to trigger the actual sync service
    // via a webhook, message queue, or other mechanism

    return NextResponse.json({
      success: true,
      message: "Sync triggered successfully",
    });
  } catch (error) {
    console.error("Error in sync trigger API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
