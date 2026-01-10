import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's tenant
    const { data: userTenant } = await supabase
      .from("user_tenants")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .single();

    if (!userTenant) {
      return NextResponse.json({ error: "No tenant found" }, { status: 404 });
    }

    // Check if user is admin for this tenant
    if (userTenant.role !== "admin") {
      // Also check if user is super_admin
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Get tenant config
    const { data: tenant, error } = await supabase
      .from("tenants")
      .select("id, name, slug, threecx_host, threecx_port, threecx_database, threecx_user, threecx_chat_files_path")
      .eq("id", userTenant.tenant_id)
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ config: tenant });
  } catch (error) {
    console.error("Error fetching tenant config:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's tenant
    const { data: userTenant } = await supabase
      .from("user_tenants")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .single();

    if (!userTenant) {
      return NextResponse.json({ error: "No tenant found" }, { status: 404 });
    }

    // Check if user is admin for this tenant
    if (userTenant.role !== "admin") {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      threecx_host: body.threecx_host,
      threecx_port: body.threecx_port ? parseInt(body.threecx_port) : 5432,
      threecx_database: body.threecx_database || "database_single",
      threecx_user: body.threecx_user || "postgres",
      threecx_chat_files_path: body.threecx_chat_files_path,
    };

    // Only update password if provided
    if (body.threecx_password) {
      updateData.threecx_password = body.threecx_password;
    }

    // Update tenant config
    const { data: tenant, error } = await supabase
      .from("tenants")
      .update(updateData)
      .eq("id", userTenant.tenant_id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ config: tenant });
  } catch (error) {
    console.error("Error updating tenant config:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
