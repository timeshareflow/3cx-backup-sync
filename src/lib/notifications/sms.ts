import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";

interface SmsConfig {
  provider: string;
  apiKey: string;
  apiSecret: string;
  fromNumber: string;
  webhookUrl?: string;
}

interface SmsOptions {
  to: string;
  message: string;
}

interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function getSmsConfig(): Promise<SmsConfig | null> {
  const supabase = await createClient();

  const { data: settings, error } = await supabase
    .from("sms_settings")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (error || !settings) {
    console.error("No active SMS settings found:", error);
    return null;
  }

  return {
    provider: settings.provider,
    apiKey: settings.api_key_encrypted ? decrypt(settings.api_key_encrypted) : "",
    apiSecret: settings.api_secret_encrypted ? decrypt(settings.api_secret_encrypted) : "",
    fromNumber: settings.from_number || "",
    webhookUrl: settings.webhook_url,
  };
}

// Wiretap Telecom API integration
async function sendWiretapSms(config: SmsConfig, options: SmsOptions): Promise<SmsResult> {
  try {
    // Wiretap API endpoint (update with actual endpoint)
    const apiUrl = process.env.WIRETAP_API_URL || "https://api.wiretaptelecom.com/v1/sms/send";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
        "X-API-Secret": config.apiSecret,
      },
      body: JSON.stringify({
        from: config.fromNumber,
        to: formatPhoneNumber(options.to),
        message: options.message,
        webhook_url: config.webhookUrl,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      messageId: data.message_id || data.id,
    };
  } catch (error) {
    console.error("Wiretap SMS error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Format phone number to E.164 format
function formatPhoneNumber(phone: string): string {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, "");

  // If it starts with 1 and is 11 digits, assume US/Canada
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }

  // If it's 10 digits, assume US/Canada and add +1
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }

  // Otherwise, assume it already has country code
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

export async function sendSms(options: SmsOptions): Promise<SmsResult> {
  const config = await getSmsConfig();

  if (!config) {
    return {
      success: false,
      error: "SMS not configured"
    };
  }

  if (!config.apiKey || !config.fromNumber) {
    return {
      success: false,
      error: "SMS configuration incomplete"
    };
  }

  switch (config.provider) {
    case "wiretap":
      return sendWiretapSms(config, options);
    default:
      return {
        success: false,
        error: `Unsupported SMS provider: ${config.provider}`,
      };
  }
}

export async function sendTemplatedSms(
  templateName: string,
  to: string,
  variables: Record<string, string>
): Promise<SmsResult> {
  const supabase = await createClient();

  // Fetch the template
  const { data: template, error } = await supabase
    .from("notification_templates")
    .select("*")
    .eq("name", templateName)
    .eq("is_active", true)
    .single();

  if (error || !template) {
    console.error("Template not found:", templateName, error);
    return {
      success: false,
      error: `Template "${templateName}" not found`,
    };
  }

  // Use text version for SMS
  let message = template.body_text || "";

  // If no text version, strip HTML tags from HTML version
  if (!message) {
    message = template.body_html
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Replace variables
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    message = message.replace(regex, value);
  }

  return sendSms({
    to,
    message,
  });
}

export async function testSmsConnection(): Promise<{ success: boolean; error?: string }> {
  const config = await getSmsConfig();

  if (!config) {
    return {
      success: false,
      error: "SMS not configured"
    };
  }

  if (!config.apiKey || !config.fromNumber) {
    return {
      success: false,
      error: "SMS configuration incomplete"
    };
  }

  // For Wiretap, we could add a balance check or ping endpoint
  return { success: true };
}
