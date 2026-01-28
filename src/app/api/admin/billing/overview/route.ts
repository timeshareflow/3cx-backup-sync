import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super admins can view platform billing overview
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = createAdminClient();

    // Get all tenants with their billing info
    const { data: tenants, error: tenantsError } = await supabase
      .from("tenants")
      .select(`
        id,
        name,
        billing_status,
        billing_cycle,
        plan_expires_at,
        storage_plan_id,
        storage_plans(id, name, price_monthly, price_yearly)
      `)
      .order("created_at", { ascending: false });

    if (tenantsError) {
      console.error("Error fetching tenants:", tenantsError);
      return NextResponse.json(
        { error: "Failed to fetch billing data" },
        { status: 500 }
      );
    }

    // Calculate revenue metrics
    let totalMRR = 0;
    let activeSubscriptions = 0;
    let trialSubscriptions = 0;
    let pastDueSubscriptions = 0;
    const revenueByPlan: Record<string, { name: string; count: number; revenue: number }> = {};

    for (const tenant of tenants || []) {
      // storage_plans can be an object (single) or array from join - handle both
      const storagePlansData = tenant.storage_plans;
      const plan = Array.isArray(storagePlansData)
        ? storagePlansData[0] as { id: string; name: string; price_monthly: string; price_yearly: string } | undefined
        : storagePlansData as { id: string; name: string; price_monthly: string; price_yearly: string } | null;

      if (tenant.billing_status === "active" && plan) {
        activeSubscriptions++;
        const monthlyPrice = parseFloat(plan.price_monthly) || 0;
        const yearlyPrice = parseFloat(plan.price_yearly || "0") || 0;

        // Calculate MRR based on billing cycle
        const mrr = tenant.billing_cycle === "yearly" && yearlyPrice
          ? yearlyPrice / 12
          : monthlyPrice;

        totalMRR += mrr;

        // Track by plan
        if (!revenueByPlan[plan.id]) {
          revenueByPlan[plan.id] = {
            name: plan.name,
            count: 0,
            revenue: 0,
          };
        }
        revenueByPlan[plan.id].count++;
        revenueByPlan[plan.id].revenue += mrr;
      } else if (tenant.billing_status === "trialing" || tenant.billing_status === "trial") {
        trialSubscriptions++;
      } else if (tenant.billing_status === "past_due") {
        pastDueSubscriptions++;
      }
    }

    // Get recent subscription changes (using audit logs)
    const { data: recentActivity } = await supabase
      .from("audit_logs")
      .select(`
        id,
        action,
        entity_id,
        new_values,
        created_at,
        user:user_profiles!audit_logs_user_id_fkey(email, full_name),
        tenant:tenants!audit_logs_tenant_id_fkey(name)
      `)
      .in("action", [
        "subscription.created",
        "subscription.cancelled",
        "payment.succeeded",
        "payment.failed",
        "plan.changed",
      ])
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      metrics: {
        totalMRR: totalMRR.toFixed(2),
        totalARR: (totalMRR * 12).toFixed(2),
        activeSubscriptions,
        trialSubscriptions,
        pastDueSubscriptions,
        totalTenants: tenants?.length || 0,
      },
      revenueByPlan: Object.values(revenueByPlan).sort((a, b) => b.revenue - a.revenue),
      recentActivity: recentActivity || [],
      tenants: tenants?.map((t) => ({
        id: t.id,
        name: t.name,
        billing_status: t.billing_status,
        billing_cycle: t.billing_cycle,
        plan_expires_at: t.plan_expires_at,
        plan: t.storage_plans,
      })) || [],
    });
  } catch (error) {
    console.error("Error in billing overview API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
