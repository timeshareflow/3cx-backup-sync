import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant context" }, { status: 400 });
    }

    const supabase = await createClient();

    // Get tenant billing info with storage plan
    const { data: tenant, error } = await supabase
      .from("tenants")
      .select(`
        id,
        name,
        storage_used_bytes,
        storage_quota_bytes,
        billing_status,
        billing_cycle,
        stripe_customer_id,
        stripe_subscription_id,
        trial_ends_at,
        storage_plan_id,
        storage_last_calculated_at,
        storage_plans (
          id,
          name,
          description,
          storage_limit_gb,
          price_monthly,
          price_yearly,
          features
        )
      `)
      .eq("id", context.tenantId)
      .single();

    if (error) {
      console.error("Error fetching billing status:", error);
      return NextResponse.json(
        { error: "Failed to fetch billing status" },
        { status: 500 }
      );
    }

    // Calculate storage usage percentage
    // storage_plans may be returned as array or single object depending on Supabase version
    const storagePlanRaw = tenant.storage_plans;
    const storagePlan = Array.isArray(storagePlanRaw) ? storagePlanRaw[0] : storagePlanRaw;
    const storageLimitBytes = storagePlan?.storage_limit_gb
      ? storagePlan.storage_limit_gb * 1024 * 1024 * 1024
      : 0;
    const storageUsedBytes = tenant.storage_used_bytes || 0;
    const storagePercentage = storageLimitBytes > 0
      ? Math.round((storageUsedBytes / storageLimitBytes) * 100)
      : 0;

    return NextResponse.json({
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      billing_status: tenant.billing_status || "active",
      billing_cycle: tenant.billing_cycle || "monthly",
      has_stripe_account: !!tenant.stripe_customer_id,
      has_subscription: !!tenant.stripe_subscription_id,
      trial_ends_at: tenant.trial_ends_at,
      storage: {
        used_bytes: storageUsedBytes,
        used_formatted: formatBytes(storageUsedBytes),
        limit_bytes: storageLimitBytes,
        limit_formatted: storageLimitBytes > 0 ? formatBytes(storageLimitBytes) : "Unlimited",
        percentage: storagePercentage,
        is_over_limit: storageLimitBytes > 0 && storageUsedBytes >= storageLimitBytes,
        is_near_limit: storageLimitBytes > 0 && storagePercentage >= 75,
        last_calculated: tenant.storage_last_calculated_at,
      },
      plan: storagePlan ? {
        id: storagePlan.id,
        name: storagePlan.name,
        description: storagePlan.description,
        storage_limit_gb: storagePlan.storage_limit_gb,
        price_monthly: storagePlan.price_monthly,
        price_yearly: storagePlan.price_yearly,
        features: storagePlan.features,
      } : null,
    });
  } catch (error) {
    console.error("Error in billing status API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
