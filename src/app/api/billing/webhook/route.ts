import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

// Lazy initialization to avoid build-time errors when env vars are not set
function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
  });
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );
}

export async function POST(request: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const tenantId = session.metadata?.tenant_id;
  const planId = session.metadata?.plan_id;
  const billingCycle = session.metadata?.billing_cycle || "monthly";

  if (!tenantId || !planId) {
    console.error("Missing metadata in checkout session");
    return;
  }

  // Update tenant with subscription info
  await getSupabaseAdmin()
    .from("tenants")
    .update({
      storage_plan_id: planId,
      stripe_subscription_id: session.subscription as string,
      billing_status: "active",
      billing_cycle: billingCycle,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);

  console.log(`Checkout completed for tenant ${tenantId}, plan ${planId}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const tenantId = subscription.metadata?.tenant_id;

  if (!tenantId) {
    // Try to find tenant by subscription ID
    const { data: tenant } = await getSupabaseAdmin()
      .from("tenants")
      .select("id")
      .eq("stripe_subscription_id", subscription.id)
      .single();

    if (!tenant) {
      console.error("Tenant not found for subscription:", subscription.id);
      return;
    }
  }

  // Map Stripe status to our billing status
  let billingStatus = "active";
  switch (subscription.status) {
    case "active":
      billingStatus = "active";
      break;
    case "past_due":
      billingStatus = "past_due";
      break;
    case "canceled":
    case "unpaid":
      billingStatus = "canceled";
      break;
    case "trialing":
      billingStatus = "trial";
      break;
    default:
      billingStatus = subscription.status;
  }

  await getSupabaseAdmin()
    .from("tenants")
    .update({
      billing_status: billingStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  console.log(`Subscription ${subscription.id} updated to ${billingStatus}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  // Find tenant by subscription ID
  const { data: tenant } = await getSupabaseAdmin()
    .from("tenants")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (!tenant) {
    console.error("Tenant not found for deleted subscription:", subscription.id);
    return;
  }

  // Get default free plan
  const { data: freePlan } = await getSupabaseAdmin()
    .from("storage_plans")
    .select("id")
    .eq("is_default", true)
    .single();

  await getSupabaseAdmin()
    .from("tenants")
    .update({
      billing_status: "canceled",
      storage_plan_id: freePlan?.id || null,
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenant.id);

  console.log(`Subscription deleted for tenant ${tenant.id}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  // Get subscription ID from parent or subscription_details
  const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;
  if (!subscriptionId) return;

  await getSupabaseAdmin()
    .from("tenants")
    .update({
      billing_status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId);

  console.log(`Payment succeeded for subscription ${subscriptionId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // Get subscription ID from parent or subscription_details
  const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;
  if (!subscriptionId) return;

  await getSupabaseAdmin()
    .from("tenants")
    .update({
      billing_status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId);

  console.log(`Payment failed for subscription ${subscriptionId}`);
}
