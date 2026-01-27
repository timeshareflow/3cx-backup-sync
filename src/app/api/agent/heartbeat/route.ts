import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  try {
    // Get the agent token from Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Parse request body
    const body = await request.json();
    const { status, last_sync_at, last_error, agent_version } = body;

    const supabase = createServiceClient();

    // Update agent status
    const { data: agent, error } = await supabase
      .from("sync_agents")
      .update({
        status: status || "active",
        last_heartbeat_at: new Date().toISOString(),
        last_sync_at: last_sync_at || null,
        last_error: last_error || null,
        agent_version: agent_version || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("agent_token", token)
      .select("id, tenant_id, status")
      .single();

    if (error || !agent) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      agent_id: agent.id,
      status: agent.status,
    });
  } catch (error) {
    console.error("Heartbeat error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
