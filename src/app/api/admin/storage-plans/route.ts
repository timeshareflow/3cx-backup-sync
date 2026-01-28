import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use admin client to bypass RLS
    const supabase = createAdminClient();

    // Anyone can view active plans
    const { data: plans, error } = await supabase
      .from("storage_plans")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Error fetching storage plans:", error);
      return NextResponse.json(
        { error: "Failed to fetch storage plans", details: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ plans: plans || [] });
  } catch (error) {
    console.error("Error in storage plans API:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Internal server error", details: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super admins can create plans
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      description,
      storage_limit_gb,
      price_monthly,
      price_yearly,
      currency,
      features,
      is_active,
      is_default,
      sort_order,
      stripe_price_id_monthly,
      stripe_price_id_yearly,
      overage_price_per_gb,
      allow_overage,
    } = body;

    if (!name || storage_limit_gb === undefined || price_monthly === undefined) {
      return NextResponse.json(
        { error: "Name, storage limit, and monthly price are required" },
        { status: 400 }
      );
    }

    // Use admin client to bypass RLS
    const supabase = createAdminClient();

    // If this plan is being set as default, unset other defaults
    if (is_default) {
      await supabase
        .from("storage_plans")
        .update({ is_default: false })
        .eq("is_default", true);
    }

    const { data: plan, error } = await supabase
      .from("storage_plans")
      .insert({
        name,
        description,
        storage_limit_gb: parseInt(storage_limit_gb),
        price_monthly: String(price_monthly),
        price_yearly: price_yearly ? String(price_yearly) : null,
        currency: currency || "USD",
        features: features || [],
        is_active: is_active ?? true,
        is_default: is_default ?? false,
        sort_order: sort_order || 0,
        stripe_price_id_monthly,
        stripe_price_id_yearly,
        overage_price_per_gb: overage_price_per_gb !== undefined ? String(overage_price_per_gb) : "0.15",
        allow_overage: allow_overage ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating storage plan:", error);
      return NextResponse.json(
        { error: "Failed to create storage plan" },
        { status: 500 }
      );
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("Error in storage plans API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super admins can update plans
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      id,
      name,
      description,
      storage_limit_gb,
      price_monthly,
      price_yearly,
      currency,
      features,
      is_active,
      is_default,
      sort_order,
      stripe_price_id_monthly,
      stripe_price_id_yearly,
      overage_price_per_gb,
      allow_overage,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Plan ID is required" }, { status: 400 });
    }

    // Use admin client to bypass RLS
    const supabase = createAdminClient();

    // If this plan is being set as default, unset other defaults
    if (is_default) {
      await supabase
        .from("storage_plans")
        .update({ is_default: false })
        .neq("id", id);
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (storage_limit_gb !== undefined) updateData.storage_limit_gb = parseInt(storage_limit_gb);
    if (price_monthly !== undefined) updateData.price_monthly = String(price_monthly);
    if (price_yearly !== undefined) updateData.price_yearly = price_yearly ? String(price_yearly) : null;
    if (currency !== undefined) updateData.currency = currency;
    if (features !== undefined) updateData.features = features;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (is_default !== undefined) updateData.is_default = is_default;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (stripe_price_id_monthly !== undefined) updateData.stripe_price_id_monthly = stripe_price_id_monthly;
    if (stripe_price_id_yearly !== undefined) updateData.stripe_price_id_yearly = stripe_price_id_yearly;
    if (overage_price_per_gb !== undefined) updateData.overage_price_per_gb = String(overage_price_per_gb);
    if (allow_overage !== undefined) updateData.allow_overage = allow_overage;

    const { data: plan, error } = await supabase
      .from("storage_plans")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating storage plan:", error);
      return NextResponse.json(
        { error: "Failed to update storage plan" },
        { status: 500 }
      );
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("Error in storage plans API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super admins can delete plans
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Plan ID is required" }, { status: 400 });
    }

    // Use admin client to bypass RLS
    const supabase = createAdminClient();

    // Check if any tenants are using this plan
    const { data: tenants, error: tenantsError } = await supabase
      .from("tenants")
      .select("id")
      .eq("storage_plan_id", id)
      .limit(1);

    if (tenantsError) {
      console.error("Error checking plan usage:", tenantsError);
      return NextResponse.json(
        { error: "Failed to check plan usage" },
        { status: 500 }
      );
    }

    if (tenants && tenants.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete plan that is in use by tenants" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("storage_plans")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting storage plan:", error);
      return NextResponse.json(
        { error: "Failed to delete storage plan" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in storage plans API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
