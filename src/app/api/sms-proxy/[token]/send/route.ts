import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";

// Normalize a phone number to E.164 format using a configurable default country code.
// If the number already starts with +, it is returned as-is.
// Otherwise the default country code (e.g. "+1", "+44") is prepended.
function normalizeNumber(phone: string, defaultCountryCode: string): string {
  const stripped = phone.trim();
  if (stripped.startsWith("+")) return stripped;

  const digits = stripped.replace(/\D/g, "");
  const cc = defaultCountryCode.replace(/\D/g, "");

  // Avoid double-prepending if the number already leads with the country code digits
  if (digits.startsWith(cc) && digits.length > cc.length + 6) {
    return `+${digits}`;
  }

  return `+${cc}${digits}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // 3CX sends a Bearer token — verify it matches the URL token
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (authHeader.replace("Bearer ", "") !== token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Look up tenant by agent_token (same token used by the sync agent)
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id, settings, is_active")
    .eq("agent_token", token)
    .single();

  if (error || !tenant || !tenant.is_active) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const settings = (tenant.settings as Record<string, unknown>) || {};

  if (!settings.sms_proxy_enabled) {
    return NextResponse.json(
      { error: "SMS proxy not enabled for this tenant" },
      { status: 403 }
    );
  }

  const defaultCountryCode = (settings.sms_default_country_code as string) || "+1";

  // Parse the request body — 3CX may send JSON or form-encoded
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

  // Normalise field names — 3CX uses various casings depending on version
  const rawTo =
    body.to ?? body.To ?? body.destination ?? body.Destination ?? "";
  const rawFrom =
    body.from ?? body.From ?? body.source ?? body.Source ?? "";
  const message =
    body.body ?? body.Body ?? body.message ?? body.Message ?? body.text ?? body.Text ?? "";

  if (!rawTo || !message) {
    return NextResponse.json(
      { error: "Missing required fields: to, message" },
      { status: 400 }
    );
  }

  const normalizedTo = normalizeNumber(rawTo, defaultCountryCode);

  // Fetch global Wiretap config
  const { data: smsSettings } = await supabase
    .from("sms_settings")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!smsSettings) {
    return NextResponse.json(
      { error: "SMS provider not configured" },
      { status: 503 }
    );
  }

  const apiKey = smsSettings.api_key_encrypted
    ? decrypt(smsSettings.api_key_encrypted)
    : "";
  const apiSecret = smsSettings.api_secret_encrypted
    ? decrypt(smsSettings.api_secret_encrypted)
    : "";
  const fromNumber = smsSettings.from_number || rawFrom;

  if (!apiKey || !fromNumber) {
    return NextResponse.json(
      { error: "SMS provider configuration incomplete" },
      { status: 503 }
    );
  }

  const apiUrl =
    process.env.WIRETAP_API_URL || "https://api.wiretaptelecom.com/v1/sms/send";

  try {
    const wiretapResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-API-Secret": apiSecret,
      },
      body: JSON.stringify({
        from: fromNumber,
        to: normalizedTo,
        message,
        ...(smsSettings.webhook_url && { webhook_url: smsSettings.webhook_url }),
      }),
    });

    if (!wiretapResponse.ok) {
      const err = await wiretapResponse.json().catch(() => ({}));
      console.error("Wiretap send error:", err);
      return NextResponse.json(
        { error: "Failed to send SMS", details: err },
        { status: 502 }
      );
    }

    const result = await wiretapResponse.json();
    return NextResponse.json({
      success: true,
      message_id: result.message_id ?? result.id,
    });
  } catch (err) {
    console.error("SMS proxy send error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
