import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();

    // Check if user is super_admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await adminClient
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch all tenants with counts (using admin client to bypass RLS)
    const { data: tenants, error } = await adminClient
      .from("tenants")
      .select(`
        *,
        user_tenants(count),
        conversations(count)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Transform the data to include counts
    const tenantsWithCounts = tenants?.map(tenant => ({
      ...tenant,
      user_count: tenant.user_tenants?.[0]?.count || 0,
      conversation_count: tenant.conversations?.[0]?.count || 0,
    }));

    return NextResponse.json({ data: tenantsWithCounts });
  } catch (error) {
    console.error("Error fetching tenants:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const body = await request.json();

    // Check if user is super_admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await adminClient
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate required fields for new tenant creation with admin
    if (!body.admin_email || !body.admin_password || !body.admin_name) {
      return NextResponse.json({
        error: "Admin email, password, and name are required"
      }, { status: 400 });
    }

    // Create the tenant first (using admin client to bypass RLS)
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .insert({
        name: body.name,
        slug: body.slug,
        is_active: true,
      })
      .select()
      .single();

    if (tenantError) {
      if (tenantError.code === "23505") {
        return NextResponse.json({ error: "A tenant with this slug already exists" }, { status: 400 });
      }
      throw tenantError;
    }

    // Create the admin user account using Supabase Auth (requires service role)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: body.admin_email,
      password: body.admin_password,
      email_confirm: true,
      user_metadata: {
        full_name: body.admin_name,
      },
    });

    if (authError) {
      // Rollback tenant creation if user creation fails
      await adminClient.from("tenants").delete().eq("id", tenant.id);
      return NextResponse.json({
        error: authError.message || "Failed to create admin user"
      }, { status: 400 });
    }

    // Create user profile manually (trigger may not work due to RLS)
    const { error: profileError } = await adminClient
      .from("user_profiles")
      .upsert({
        id: authData.user.id,
        email: body.admin_email,
        full_name: body.admin_name,
        role: "admin",
      });

    if (profileError) {
      console.error("Failed to create user profile:", profileError);
    }

    // Link user to tenant with admin role
    const { error: linkError } = await adminClient
      .from("user_tenants")
      .insert({
        user_id: authData.user.id,
        tenant_id: tenant.id,
        role: "admin",
      });

    if (linkError) {
      console.error("Failed to link user to tenant:", linkError);
    }

    return NextResponse.json({ data: tenant });
  } catch (error) {
    console.error("Error creating tenant:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
