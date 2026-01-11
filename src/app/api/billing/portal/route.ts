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

    // Only admins can access billing portal
    if (!["admin", "super_admin"].includes(context.role || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createClient();

    // Get tenant's Stripe customer ID
    const { data: tenant, error } = await supabase
      .from("tenants")
      .select("stripe_customer_id")
      .eq("id", context.tenantId)
      .single();

    if (error || !tenant?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No billing account found. Please subscribe to a plan first." },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "";

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${baseUrl}/admin/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Error creating portal session:", error);
    return NextResponse.json(
      { error: "Failed to create billing portal session" },
      { status: 500 }
    );
  }
}
