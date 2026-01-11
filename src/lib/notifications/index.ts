import { createClient } from "@/lib/supabase/server";
import { sendEmail, sendTemplatedEmail, testSmtpConnection } from "./email";
import { sendSms, sendTemplatedSms, testSmsConnection } from "./sms";
import { sendPushNotification, sendPushToMultipleUsers, testPushConnection, registerPushToken, unregisterPushToken } from "./push";

export type NotificationChannel = "email" | "sms" | "push";

export interface NotificationOptions {
  userId?: string;
  tenantId?: string;
  type: string;
  channels?: NotificationChannel[];
  // Email specific
  email?: string;
  subject?: string;
  html?: string;
  text?: string;
  // SMS specific
  phone?: string;
  message?: string;
  // Push specific
  title?: string;
  body?: string;
  data?: Record<string, string>;
  badge?: number;
  // Template support
  template?: string;
  variables?: Record<string, string>;
}

interface NotificationResult {
  success: boolean;
  channels: {
    email?: { success: boolean; error?: string };
    sms?: { success: boolean; error?: string };
    push?: { success: boolean; sent?: number; failed?: number; error?: string };
  };
}

// Get user's notification preferences
async function getUserPreferences(userId: string, notificationType: string): Promise<{
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
}> {
  const supabase = await createClient();

  const { data: prefs } = await supabase
    .from("user_notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .eq("notification_type", notificationType)
    .single();

  // Default preferences if not set
  return {
    emailEnabled: prefs?.email_enabled ?? true,
    smsEnabled: prefs?.sms_enabled ?? false,
    pushEnabled: prefs?.push_enabled ?? true,
  };
}

// Get user's contact info
async function getUserContact(userId: string): Promise<{
  email?: string;
  phone?: string;
}> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("email, phone")
    .eq("id", userId)
    .single();

  return {
    email: profile?.email,
    phone: (profile as { phone?: string })?.phone,
  };
}

// Log notification attempt
async function logNotification(
  channel: NotificationChannel,
  options: NotificationOptions,
  success: boolean,
  error?: string
): Promise<void> {
  const supabase = await createClient();

  await supabase.from("notification_logs").insert({
    tenant_id: options.tenantId,
    user_id: options.userId,
    notification_type: options.type,
    channel,
    recipient: channel === "email" ? options.email : channel === "sms" ? options.phone : options.userId,
    subject: options.subject || options.title,
    status: success ? "sent" : "failed",
    error_message: error,
    metadata: {
      template: options.template,
      variables: options.variables,
    },
    sent_at: success ? new Date().toISOString() : null,
  });
}

export async function sendNotification(options: NotificationOptions): Promise<NotificationResult> {
  const result: NotificationResult = {
    success: false,
    channels: {},
  };

  // Determine which channels to use
  let channels = options.channels || ["email", "push"];

  // If user is specified, check their preferences
  if (options.userId && !options.channels) {
    const prefs = await getUserPreferences(options.userId, options.type);
    channels = [];
    if (prefs.emailEnabled) channels.push("email");
    if (prefs.smsEnabled) channels.push("sms");
    if (prefs.pushEnabled) channels.push("push");
  }

  // Get user contact info if not provided
  if (options.userId && (!options.email || !options.phone)) {
    const contact = await getUserContact(options.userId);
    if (!options.email) options.email = contact.email;
    if (!options.phone) options.phone = contact.phone;
  }

  // Send via each channel
  for (const channel of channels) {
    switch (channel) {
      case "email":
        if (options.email) {
          let emailResult;
          if (options.template && options.variables) {
            emailResult = await sendTemplatedEmail(options.template, options.email, options.variables);
          } else if (options.html) {
            emailResult = await sendEmail({
              to: options.email,
              subject: options.subject || "Notification",
              html: options.html,
              text: options.text,
            });
          }

          if (emailResult) {
            result.channels.email = {
              success: emailResult.success,
              error: emailResult.error,
            };
            await logNotification(channel, options, emailResult.success, emailResult.error);
          }
        }
        break;

      case "sms":
        if (options.phone) {
          let smsResult;
          if (options.template && options.variables) {
            smsResult = await sendTemplatedSms(options.template, options.phone, options.variables);
          } else if (options.message) {
            smsResult = await sendSms({
              to: options.phone,
              message: options.message,
            });
          }

          if (smsResult) {
            result.channels.sms = {
              success: smsResult.success,
              error: smsResult.error,
            };
            await logNotification(channel, options, smsResult.success, smsResult.error);
          }
        }
        break;

      case "push":
        if (options.userId) {
          const pushResult = await sendPushNotification({
            userId: options.userId,
            title: options.title || options.subject || "Notification",
            body: options.body || options.message || "",
            data: options.data,
            badge: options.badge,
          });

          result.channels.push = {
            success: pushResult.success,
            sent: pushResult.sent,
            failed: pushResult.failed,
            error: pushResult.errors?.join(", "),
          };
          await logNotification(channel, options, pushResult.success, pushResult.errors?.join(", "));
        }
        break;
    }
  }

  // Overall success if at least one channel succeeded
  result.success = Object.values(result.channels).some(c => c?.success);

  return result;
}

// Specific notification helpers
export async function sendStorageWarning(
  userId: string,
  tenantId: string,
  variables: {
    user_name: string;
    storage_percentage: string;
    plan_name: string;
    storage_used: string;
    storage_limit: string;
    upgrade_url: string;
  }
): Promise<NotificationResult> {
  return sendNotification({
    userId,
    tenantId,
    type: "storage_warning",
    template: "storage_warning",
    variables,
    title: `Storage Alert: ${variables.storage_percentage}% Used`,
    body: `Your storage is at ${variables.storage_percentage}% capacity. Consider upgrading your plan.`,
  });
}

export async function sendPaymentFailed(
  userId: string,
  tenantId: string,
  variables: {
    user_name: string;
    plan_name: string;
    billing_url: string;
  }
): Promise<NotificationResult> {
  return sendNotification({
    userId,
    tenantId,
    type: "payment_failed",
    template: "payment_failed",
    variables,
    title: "Payment Failed",
    body: "We were unable to process your payment. Please update your payment method.",
  });
}

export async function sendSyncError(
  userId: string,
  tenantId: string,
  variables: {
    user_name: string;
    tenant_name: string;
    error_message: string;
  }
): Promise<NotificationResult> {
  return sendNotification({
    userId,
    tenantId,
    type: "sync_error",
    template: "sync_error",
    variables,
    title: "Sync Error Alert",
    body: `Sync error detected: ${variables.error_message}`,
  });
}

export async function sendWelcome(
  userId: string,
  variables: {
    user_name: string;
    login_url: string;
  }
): Promise<NotificationResult> {
  return sendNotification({
    userId,
    type: "welcome",
    template: "welcome",
    variables,
    title: "Welcome to 3CX BackupWiz",
    body: "Your account has been created successfully.",
    channels: ["email"], // Welcome email only
  });
}

// Test all notification channels
export async function testAllChannels(): Promise<{
  email: { success: boolean; error?: string };
  sms: { success: boolean; error?: string };
  push: { success: boolean; error?: string };
}> {
  const [emailResult, smsResult, pushResult] = await Promise.all([
    testSmtpConnection(),
    testSmsConnection(),
    testPushConnection(),
  ]);

  return {
    email: emailResult,
    sms: smsResult,
    push: pushResult,
  };
}

// Re-export individual services
export {
  sendEmail,
  sendTemplatedEmail,
  testSmtpConnection,
  sendSms,
  sendTemplatedSms,
  testSmsConnection,
  sendPushNotification,
  sendPushToMultipleUsers,
  testPushConnection,
  registerPushToken,
  unregisterPushToken,
};
