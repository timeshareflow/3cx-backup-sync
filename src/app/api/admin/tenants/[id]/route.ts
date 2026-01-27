import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const body = await request.json();

    // Check if user is super_admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.threecx_host !== undefined) updateData.threecx_host = body.threecx_host || null;
    if (body.threecx_port !== undefined) updateData.threecx_port = body.threecx_port ? parseInt(body.threecx_port) : null;
    if (body.threecx_database !== undefined) updateData.threecx_database = body.threecx_database || null;
    if (body.threecx_user !== undefined) updateData.threecx_user = body.threecx_user || null;
    if (body.threecx_password !== undefined && body.threecx_password) {
      updateData.threecx_password = body.threecx_password;
    }
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.storage_plan_id !== undefined) updateData.storage_plan_id = body.storage_plan_id || null;
    if (body.price_override !== undefined) {
      updateData.price_override = body.price_override ? parseFloat(body.price_override) : null;
    }
    if (body.billing_email !== undefined) updateData.billing_email = body.billing_email || null;

    // Update tenant
    const { data: tenant, error } = await supabase
      .from("tenants")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ data: tenant });
  } catch (error) {
    console.error("Error updating tenant:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Check if user is super_admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete tenant (cascades to related data due to FK constraints)
    const { error } = await supabase
      .from("tenants")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting tenant:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
