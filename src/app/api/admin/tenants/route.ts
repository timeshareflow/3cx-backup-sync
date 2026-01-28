import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api-utils";

export async function GET() {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();

    // Check if user is super_admin
    const { data: { user } } = await supabase.auth.getUser();
    console.log("Tenants API - user:", user?.id, user?.email);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    console.log("Tenants API - profile:", profile, "error:", profileError);

    if (profile?.role !== "super_admin") {
      console.log("Tenants API - not super_admin, role:", profile?.role);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch all tenants with counts and storage plan (using admin client to bypass RLS)
    const { data: tenants, error } = await adminClient
      .from("tenants")
      .select(`
        *,
        user_tenants(count),
        conversations(count),
        storage_plan:storage_plans(id, name, description, storage_limit_gb, price_monthly, price_yearly, features, is_default)
      `)
      .order("created_at", { ascending: false });

    console.log("Tenants API - fetched tenants:", tenants?.length, "error:", error);

    if (error) {
      throw error;
    }

    // Transform the data to include counts
    const tenantsWithCounts = tenants?.map(tenant => ({
      ...tenant,
      user_count: tenant.user_tenants?.[0]?.count || 0,
      conversation_count: tenant.conversations?.[0]?.count || 0,
      storage_plan: tenant.storage_plan || null,
    }));

    return NextResponse.json({ data: tenantsWithCounts });
  } catch (error) {
    console.error("Error fetching tenants:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json({
      error: "Internal server error",
      details: errorMessage,
      stack: errorStack
    }, { status: 500 });
  }
}

interface CreateTenantRequest {
  customerType: "standard" | "business";
  name: string;
  slug: string;
  // Standard user fields
  admin_first_name?: string;
  admin_last_name?: string;
  admin_email?: string;
  admin_phone?: string;
  admin_address?: string;
  admin_password: string;
  // Business fields
  business_name?: string;
  contact_name?: string;
  billing_email?: string;
  business_phone?: string;
  business_address?: string;
}

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody<CreateTenantRequest>(request);
    if ("error" in parsed) return parsed.error;

    const body = parsed.data;
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

    // Validate required fields based on customer type
    const customerType = body.customerType || "standard";
    let adminEmail: string;
    let adminName: string;

    if (customerType === "standard") {
      if (!body.admin_first_name || !body.admin_last_name || !body.admin_email || !body.admin_phone || !body.admin_address) {
        return NextResponse.json({
          error: "First name, last name, email, phone, and address are required for standard customers"
        }, { status: 400 });
      }
      adminEmail = body.admin_email;
      adminName = `${body.admin_first_name} ${body.admin_last_name}`;
    } else {
      if (!body.business_name || !body.contact_name || !body.billing_email || !body.business_phone || !body.business_address) {
        return NextResponse.json({
          error: "Business name, contact name, billing email, phone, and address are required for business customers"
        }, { status: 400 });
      }
      adminEmail = body.billing_email;
      adminName = body.contact_name;
    }

    if (!body.admin_password) {
      return NextResponse.json({
        error: "Password is required"
      }, { status: 400 });
    }

    // Create the tenant first (using admin client to bypass RLS)
    const tenantData: Record<string, unknown> = {
      name: body.name,
      slug: body.slug,
      is_active: true,
      customer_type: customerType,
    };

    // Add business fields if business customer
    if (customerType === "business") {
      tenantData.business_name = body.business_name;
      tenantData.contact_name = body.contact_name;
      tenantData.billing_email = body.billing_email;
      tenantData.business_phone = body.business_phone;
      tenantData.business_address = body.business_address;
    }

    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .insert(tenantData)
      .select()
      .single();

    if (tenantError) {
      if (tenantError.code === "23505") {
        return NextResponse.json({ error: "A tenant with this slug already exists" }, { status: 400 });
      }
      throw tenantError;
    }

    // Build user metadata based on customer type
    const userMetadata: Record<string, string> = {
      full_name: adminName,
      customer_type: customerType,
    };

    if (customerType === "standard") {
      userMetadata.first_name = body.admin_first_name!;
      userMetadata.last_name = body.admin_last_name!;
      userMetadata.phone = body.admin_phone!;
      userMetadata.address = body.admin_address!;
    } else {
      userMetadata.business_name = body.business_name!;
      userMetadata.contact_name = body.contact_name!;
      userMetadata.business_phone = body.business_phone!;
      userMetadata.business_address = body.business_address!;
    }

    // Create the admin user account using Supabase Auth (requires service role)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: body.admin_password,
      email_confirm: true,
      user_metadata: userMetadata,
    });

    if (authError) {
      // Rollback tenant creation if user creation fails
      await adminClient.from("tenants").delete().eq("id", tenant.id);
      return NextResponse.json({
        error: authError.message || "Failed to create admin user"
      }, { status: 400 });
    }

    // Create user profile manually (trigger may not work due to RLS)
    const profileData: Record<string, unknown> = {
      id: authData.user.id,
      email: adminEmail,
      full_name: adminName,
      role: "admin",
    };

    if (customerType === "standard") {
      profileData.first_name = body.admin_first_name;
      profileData.last_name = body.admin_last_name;
      profileData.phone = body.admin_phone;
      profileData.address = body.admin_address;
    }

    const { error: profileError } = await adminClient
      .from("user_profiles")
      .upsert(profileData);

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
