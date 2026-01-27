import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    // Get the agent token from Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Parse request body
    const body = await request.json();
    const { hostname, ip_address, os_info, agent_version, install_path } = body;

    // Use service client for admin operations
    const supabase = createAdminClient();

    // Find tenant by agent token
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, slug")
      .eq("agent_token", token)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: "Invalid agent token" },
        { status: 401 }
      );
    }

    // Check if agent already exists for this tenant
    const { data: existingAgent } = await supabase
      .from("sync_agents")
      .select("id")
      .eq("tenant_id", tenant.id)
      .single();

    const agentData = {
      tenant_id: tenant.id,
      hostname,
      ip_address,
      os_info,
      agent_version: agent_version || "1.0.0",
      install_path,
      agent_token: token,
      status: "active",
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let agent;
    if (existingAgent) {
      // Update existing agent
      const { data, error } = await supabase
        .from("sync_agents")
        .update(agentData)
        .eq("id", existingAgent.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating agent:", error);
        return NextResponse.json(
          { success: false, error: "Failed to update agent registration" },
          { status: 500 }
        );
      }
      agent = data;
    } else {
      // Create new agent
      const { data, error } = await supabase
        .from("sync_agents")
        .insert(agentData)
        .select()
        .single();

      if (error) {
        console.error("Error creating agent:", error);
        return NextResponse.json(
          { success: false, error: "Failed to create agent registration" },
          { status: 500 }
        );
      }
      agent = data;
    }

    // Return Supabase credentials for the agent to use
    // These are read from environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase environment variables");
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Agent registered successfully",
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      tenant_slug: tenant.slug,
      agent_id: agent.id,
      supabase_url: supabaseUrl,
      supabase_service_role_key: supabaseServiceKey,
    });
  } catch (error) {
    console.error("Agent registration error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
