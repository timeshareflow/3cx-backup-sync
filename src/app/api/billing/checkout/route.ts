import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
});

export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant context" }, { status: 400 });
    }

    // Only admins can manage billing
    if (!["admin", "super_admin"].includes(context.role || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { plan_id, billing_cycle = "monthly" } = body;

    if (!plan_id) {
      return NextResponse.json({ error: "Plan ID is required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Get the storage plan
    const { data: plan, error: planError } = await supabase
      .from("storage_plans")
      .select("*")
      .eq("id", plan_id)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Get Stripe price ID based on billing cycle
    const priceId = billing_cycle === "yearly"
      ? plan.stripe_price_id_yearly
      : plan.stripe_price_id_monthly;

    if (!priceId) {
      return NextResponse.json(
        { error: "Stripe price not configured for this plan" },
        { status: 400 }
      );
    }

    // Get tenant info
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, stripe_customer_id")
      .eq("id", context.tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    // Get or create Stripe customer
    let customerId = tenant.stripe_customer_id;

    if (!customerId) {
      // Get user email
      const { data: userProfile } = await supabase
        .from("user_profiles")
        .select("email")
        .eq("auth_user_id", context.userId)
        .single();

      const customer = await stripe.customers.create({
        email: userProfile?.email || undefined,
        metadata: {
          tenant_id: context.tenantId,
          tenant_name: tenant.name,
        },
      });

      customerId = customer.id;

      // Save customer ID to tenant
      await supabase
        .from("tenants")
        .update({ stripe_customer_id: customerId })
        .eq("id", context.tenantId);
    }

    // Create checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${baseUrl}/admin/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/admin/billing?canceled=true`,
      metadata: {
        tenant_id: context.tenantId,
        plan_id: plan.id,
        billing_cycle,
      },
      subscription_data: {
        metadata: {
          tenant_id: context.tenantId,
          plan_id: plan.id,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
