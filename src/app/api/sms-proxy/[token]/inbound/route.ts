import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const supabase = createAdminClient();

  // Look up tenant by agent_token
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id, settings, is_active, threecx_host")
    .eq("agent_token", token)
    .single();

  if (error || !tenant || !tenant.is_active) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const settings = (tenant.settings as Record<string, unknown>) || {};

  if (!settings.sms_proxy_enabled) {
    return NextResponse.json({ error: "SMS proxy not enabled" }, { status: 403 });
  }

  // Parse Wiretap inbound webhook body
  let body: Record<string, string> = {};
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    body = await request.json();
  } else {
    const form = await request.formData();
    form.forEach((value, key) => {
      body[key] = value.toString();
    });
  }

  // Normalise field names from Wiretap webhook payload
  const from =
    body.from ?? body.From ?? body.sender ?? body.Sender ?? "";
  const to =
    body.to ?? body.To ?? body.recipient ?? body.Recipient ?? "";
  const message =
    body.body ?? body.Body ?? body.message ?? body.Message ?? body.text ?? body.Text ?? "";

  if (!from || !message) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 3CX inbound SMS endpoint and bearer token — stored per-tenant in settings.
  // In 3CX admin: Settings → SMS → your provider → copy the inbound webhook URL and token.
  const threecxInboundUrl = settings.threecx_sms_inbound_url as string | undefined;
  const threecxBearerToken = settings.threecx_sms_bearer_token as string | undefined;

  if (!threecxInboundUrl || !threecxBearerToken) {
    console.error(
      `Tenant ${tenant.id}: 3CX inbound SMS URL or bearer token not configured in tenant settings`
    );
    return NextResponse.json(
      { error: "3CX inbound SMS not configured — set threecx_sms_inbound_url and threecx_sms_bearer_token in tenant settings" },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(threecxInboundUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${threecxBearerToken}`,
      },
      body: JSON.stringify({ from, to, body: message }),
    });

    if (!response.ok) {
      console.error(
        `Tenant ${tenant.id}: Failed to forward inbound SMS to 3CX — HTTP ${response.status}`
      );
      return NextResponse.json(
        { error: "Failed to forward to 3CX" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`Tenant ${tenant.id}: Error forwarding inbound SMS to 3CX:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
