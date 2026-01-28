import nodemailer from "nodemailer";
import sgMail from "@sendgrid/mail";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";

interface EmailConfig {
  provider: "smtp" | "sendgrid";
  // SMTP settings
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  // SendGrid settings
  sendgridApiKey?: string;
  // Common settings
  from: {
    name: string;
    email: string;
  };
}

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function getEmailConfig(): Promise<EmailConfig | null> {
  const supabase = createAdminClient();

  console.log("getEmailConfig - fetching settings...");

  // First check all settings to debug issues
  const { data: allSettings } = await supabase
    .from("smtp_settings")
    .select("id, provider, is_active, from_email, sendgrid_api_key_encrypted")
    .limit(5);

  if (allSettings && allSettings.length > 0) {
    console.log("getEmailConfig - found", allSettings.length, "settings records");
    allSettings.forEach((s, i) => {
      console.log(`  Record ${i}: id=${s.id}, provider=${s.provider}, is_active=${s.is_active}, has_api_key=${!!s.sendgrid_api_key_encrypted}`);
    });
  } else {
    console.log("getEmailConfig - no settings records found in database");
  }

  const { data: settings, error } = await supabase
    .from("smtp_settings")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (error || !settings) {
    console.error("No active email settings found:", error);
    // Check if there's a record that's just not active
    const inactiveRecord = allSettings?.find(s => !s.is_active);
    if (inactiveRecord) {
      console.log("getEmailConfig - Found inactive settings record. Enable 'Email sending' toggle in admin.");
    }
    return null;
  }

  console.log("getEmailConfig - settings found, provider:", settings.provider);
  console.log("getEmailConfig - has encrypted API key:", !!settings.sendgrid_api_key_encrypted);

  const provider = settings.provider || "smtp";

  const config: EmailConfig = {
    provider,
    from: {
      name: settings.from_name || "3CX BackupWiz",
      email: settings.from_email,
    },
  };

  if (provider === "sendgrid") {
    if (settings.sendgrid_api_key_encrypted) {
      console.log("getEmailConfig - decrypting API key...");
      config.sendgridApiKey = decrypt(settings.sendgrid_api_key_encrypted);
      console.log("getEmailConfig - decrypted key length:", config.sendgridApiKey?.length || 0);
      console.log("getEmailConfig - decrypted key starts with SG.:", config.sendgridApiKey?.startsWith("SG.") || false);
    } else {
      console.log("getEmailConfig - no encrypted API key found in settings");
    }
  } else {
    // SMTP configuration
    config.host = settings.host;
    config.port = settings.port;
    config.secure = settings.encryption === "ssl";

    if (settings.username && settings.password_encrypted) {
      config.auth = {
        user: settings.username,
        pass: decrypt(settings.password_encrypted),
      };
    }
  }

  return config;
}

async function sendViaSendGrid(config: EmailConfig, options: EmailOptions): Promise<EmailResult> {
  console.log("SendGrid - checking API key...");
  console.log("SendGrid - API key present:", !!config.sendgridApiKey);
  console.log("SendGrid - API key length:", config.sendgridApiKey?.length || 0);
  console.log("SendGrid - API key starts with SG.:", config.sendgridApiKey?.startsWith("SG.") || false);

  if (!config.sendgridApiKey) {
    return {
      success: false,
      error: "SendGrid API key not configured",
    };
  }

  try {
    sgMail.setApiKey(config.sendgridApiKey);

    const msg = {
      to: options.to,
      from: {
        email: config.from.email,
        name: config.from.name,
      },
      subject: options.subject,
      text: options.text || options.html.replace(/<[^>]*>/g, ""),
      html: options.html,
      replyTo: options.replyTo,
    };

    console.log("SendGrid - sending to:", options.to);
    console.log("SendGrid - from:", config.from.email);

    const [response] = await sgMail.send(msg);

    console.log("SendGrid - success, message ID:", response.headers["x-message-id"]);

    return {
      success: true,
      messageId: response.headers["x-message-id"],
    };
  } catch (error: unknown) {
    console.error("SendGrid error:", error);
    // Log more details for SendGrid errors
    if (error && typeof error === 'object' && 'response' in error) {
      const sgError = error as { response?: { body?: unknown } };
      console.error("SendGrid response body:", JSON.stringify(sgError.response?.body, null, 2));
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "SendGrid send failed",
    };
  }
}

async function sendViaSmtp(config: EmailConfig, options: EmailOptions): Promise<EmailResult> {
  if (!config.host) {
    return {
      success: false,
      error: "SMTP host not configured",
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port || 587,
      secure: config.secure,
      auth: config.auth,
      tls: {
        rejectUnauthorized: false, // Allow self-signed certs
      },
    });

    const mailOptions = {
      from: `"${config.from.name}" <${config.from.email}>`,
      to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    };

    const result = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error("SMTP error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "SMTP send failed",
    };
  }
}

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const config = await getEmailConfig();

  if (!config) {
    return {
      success: false,
      error: "Email not configured",
    };
  }

  if (config.provider === "sendgrid") {
    return sendViaSendGrid(config, options);
  } else {
    return sendViaSmtp(config, options);
  }
}

export async function sendTemplatedEmail(
  templateName: string,
  to: string | string[],
  variables: Record<string, string>
): Promise<EmailResult> {
  const supabase = createAdminClient();

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

  // Replace variables in template
  let subject = template.subject;
  let html = template.body_html;
  let text = template.body_text || "";

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    subject = subject.replace(regex, value);
    html = html.replace(regex, value);
    text = text.replace(regex, value);
  }

  return sendEmail({
    to,
    subject,
    html,
    text,
  });
}

export async function testEmailConnection(): Promise<{ success: boolean; error?: string; provider?: string }> {
  const config = await getEmailConfig();

  if (!config) {
    return {
      success: false,
      error: "Email not configured",
    };
  }

  if (config.provider === "sendgrid") {
    // For SendGrid, we'll try sending a test request to validate the API key
    if (!config.sendgridApiKey) {
      return {
        success: false,
        error: "SendGrid API key not configured",
        provider: "sendgrid",
      };
    }

    try {
      sgMail.setApiKey(config.sendgridApiKey);
      // SendGrid doesn't have a verify method, so we return success if API key is set
      // The real test will be when we send an email
      return {
        success: true,
        provider: "sendgrid",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "SendGrid configuration error",
        provider: "sendgrid",
      };
    }
  } else {
    // SMTP verification
    if (!config.host) {
      return {
        success: false,
        error: "SMTP host not configured",
        provider: "smtp",
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port || 587,
        secure: config.secure,
        auth: config.auth,
        tls: {
          rejectUnauthorized: false,
        },
      });

      await transporter.verify();

      return {
        success: true,
        provider: "smtp",
      };
    } catch (error) {
      console.error("SMTP connection test failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        provider: "smtp",
      };
    }
  }
}

// Legacy export for backwards compatibility
export const testSmtpConnection = testEmailConnection;

// Get the app URL (production or development)
function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://backupwiz.com";
}

// Get the app name
function getAppName(): string {
  return process.env.NEXT_PUBLIC_APP_NAME || "3CX BackupWiz";
}

// Create a branded email wrapper
function wrapInBrandedTemplate(content: string, options?: {
  preheader?: string;
  showFooter?: boolean;
}): string {
  const appUrl = getAppUrl();
  const appName = getAppName();
  const year = new Date().getFullYear();
  const { preheader = "", showFooter = true } = options || {};

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${appName}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body { margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; }
    img { border: 0; }
    a { color: #14b8a6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 20px !important; }
      .content { padding: 24px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  ${preheader ? `<div style="display: none; max-height: 0; overflow: hidden;">${preheader}</div>` : ""}

  <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" class="container" style="width: 100%; max-width: 600px;">
          <!-- Header -->
          <tr>
            <td style="text-align: center; padding-bottom: 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="background: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%); padding: 12px 24px; border-radius: 12px;">
                    <span style="font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">${appName}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td class="content" style="background-color: #ffffff; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              ${content}
            </td>
          </tr>

          ${showFooter ? `
          <!-- Footer -->
          <tr>
            <td style="text-align: center; padding-top: 32px;">
              <p style="margin: 0 0 8px; color: #64748b; font-size: 14px;">
                Powered by <a href="${appUrl}" style="color: #14b8a6; font-weight: 600;">${appName}</a>
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                &copy; ${year} ${appName}. All rights reserved.
              </p>
            </td>
          </tr>
          ` : ""}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// Send a test email
export async function sendTestEmail(to: string): Promise<EmailResult> {
  const appName = getAppName();
  const appUrl = getAppUrl();

  const content = `
    <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #0f172a;">
      Email Configuration Test
    </h1>
    <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
      Congratulations! Your email configuration is working correctly.
    </p>
    <div style="background: linear-gradient(135deg, #f0fdfa 0%, #ecfeff 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <div style="display: flex; align-items: center; margin-bottom: 12px;">
        <span style="width: 40px; height: 40px; background-color: #14b8a6; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px;">
          <svg width="20" height="20" fill="#ffffff" viewBox="0 0 24 24">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
          </svg>
        </span>
        <span style="font-size: 18px; font-weight: 600; color: #0f172a;">Configuration Verified</span>
      </div>
      <p style="margin: 0; color: #475569; font-size: 14px;">
        This test email was sent from ${appName} to verify that your email settings are properly configured.
      </p>
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">
      <tr>
        <td style="padding: 16px 0; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0; color: #94a3b8; font-size: 12px;">
            <strong>Sent at:</strong> ${new Date().toLocaleString("en-US", {
              dateStyle: "full",
              timeStyle: "long"
            })}
          </p>
          <p style="margin: 8px 0 0; color: #94a3b8; font-size: 12px;">
            <strong>App URL:</strong> <a href="${appUrl}" style="color: #14b8a6;">${appUrl}</a>
          </p>
        </td>
      </tr>
    </table>
  `;

  const html = wrapInBrandedTemplate(content, {
    preheader: "Your email configuration is working correctly!"
  });

  return sendEmail({
    to,
    subject: `Test Email from ${appName}`,
    html,
    text: `Email Configuration Test\n\nCongratulations! Your email configuration is working correctly.\n\nThis test email was sent from ${appName} to verify that your email settings are properly configured.\n\nSent at: ${new Date().toISOString()}\nApp URL: ${appUrl}`,
  });
}

// Send a welcome email to a new user
export async function sendWelcomeEmail(
  to: string,
  name: string,
  tempPassword?: string
): Promise<EmailResult> {
  const appName = getAppName();
  const appUrl = getAppUrl();

  const content = `
    <h1 style="margin: 0 0 8px; font-size: 28px; font-weight: 700; color: #0f172a;">
      Welcome to ${appName}! 🎉
    </h1>
    <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
      Hi ${name || "there"},
    </p>
    <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
      Your account has been created and you're ready to start backing up your 3CX communications. We're excited to have you on board!
    </p>

    ${tempPassword ? `
    <div style="background-color: #fef3c7; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #fcd34d;">
      <h3 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #92400e;">
        🔐 Your Temporary Password
      </h3>
      <p style="margin: 0 0 12px; color: #78350f; font-size: 14px;">
        Please change this after your first login:
      </p>
      <code style="display: block; background-color: #ffffff; padding: 12px 16px; border-radius: 8px; font-family: monospace; font-size: 16px; color: #0f172a; border: 1px solid #fcd34d;">
        ${tempPassword}
      </code>
    </div>
    ` : ""}

    <div style="background: linear-gradient(135deg, #f0fdfa 0%, #ecfeff 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <h3 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #0f172a;">
        What you can do with ${appName}:
      </h3>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #14b8a6; margin-right: 8px;">✓</span>
            <span style="color: #334155; font-size: 14px;">Archive chat messages and media files</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #14b8a6; margin-right: 8px;">✓</span>
            <span style="color: #334155; font-size: 14px;">Store call recordings securely</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #14b8a6; margin-right: 8px;">✓</span>
            <span style="color: #334155; font-size: 14px;">Search through your communication history</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #14b8a6; margin-right: 8px;">✓</span>
            <span style="color: #334155; font-size: 14px;">Export data in multiple formats</span>
          </td>
        </tr>
      </table>
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 32px auto;">
      <tr>
        <td style="background: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%); border-radius: 8px;">
          <a href="${appUrl}/login" style="display: inline-block; padding: 14px 32px; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none;">
            Sign In to Your Account →
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 0; color: #94a3b8; font-size: 14px; text-align: center;">
      If you have any questions, just reply to this email. We're here to help!
    </p>
  `;

  const html = wrapInBrandedTemplate(content, {
    preheader: `Welcome to ${appName}! Your account is ready.`
  });

  return sendEmail({
    to,
    subject: `Welcome to ${appName}! 🎉`,
    html,
    text: `Welcome to ${appName}!\n\nHi ${name || "there"},\n\nYour account has been created and you're ready to start backing up your 3CX communications.\n\n${tempPassword ? `Your temporary password: ${tempPassword}\nPlease change this after your first login.\n\n` : ""}Sign in at: ${appUrl}/login\n\nIf you have any questions, just reply to this email.`,
  });
}

// Send an invitation email to a new user
export async function sendInviteEmail(
  to: string,
  name: string,
  inviteLink: string,
  tenantName?: string
): Promise<EmailResult> {
  const appName = getAppName();
  const appUrl = getAppUrl();

  const content = `
    <h1 style="margin: 0 0 8px; font-size: 28px; font-weight: 700; color: #0f172a;">
      You've Been Invited! 🎉
    </h1>
    <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
      Hi ${name || "there"},
    </p>
    <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
      You've been invited to join ${tenantName ? `<strong>${tenantName}</strong> on ` : ""}${appName} - a secure platform for archiving and managing your 3CX communications.
    </p>

    <div style="background: linear-gradient(135deg, #f0fdfa 0%, #ecfeff 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <h3 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #0f172a;">
        What you'll get access to:
      </h3>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #14b8a6; margin-right: 8px;">✓</span>
            <span style="color: #334155; font-size: 14px;">Secure chat message archives</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #14b8a6; margin-right: 8px;">✓</span>
            <span style="color: #334155; font-size: 14px;">Call recordings and voicemails</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #14b8a6; margin-right: 8px;">✓</span>
            <span style="color: #334155; font-size: 14px;">Powerful search and export tools</span>
          </td>
        </tr>
      </table>
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 32px auto;">
      <tr>
        <td style="background: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%); border-radius: 8px;">
          <a href="${inviteLink}" style="display: inline-block; padding: 14px 32px; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none;">
            Accept Invitation & Set Password →
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 24px 0 0; color: #94a3b8; font-size: 14px; text-align: center;">
      This invitation link will expire in 24 hours.
    </p>
    <p style="margin: 8px 0 0; color: #94a3b8; font-size: 12px; text-align: center;">
      If you didn't expect this invitation, you can safely ignore this email.
    </p>
  `;

  const html = wrapInBrandedTemplate(content, {
    preheader: `You've been invited to join ${tenantName || appName}!`
  });

  return sendEmail({
    to,
    subject: `You've been invited to ${tenantName || appName}`,
    html,
    text: `You've been invited to ${appName}!\n\nHi ${name || "there"},\n\nYou've been invited to join ${tenantName ? tenantName + " on " : ""}${appName}.\n\nClick here to accept the invitation and set your password:\n${inviteLink}\n\nThis link will expire in 24 hours.\n\nIf you didn't expect this invitation, you can safely ignore this email.`,
  });
}

// Send a billing notification email
export async function sendBillingEmail(
  to: string,
  type: "invoice" | "payment_success" | "payment_failed" | "subscription_cancelled" | "trial_ending",
  data: {
    name?: string;
    amount?: string;
    invoiceUrl?: string;
    planName?: string;
    endDate?: string;
    daysRemaining?: number;
  }
): Promise<EmailResult> {
  const appName = getAppName();
  const appUrl = getAppUrl();

  let subject = "";
  let content = "";
  let preheader = "";

  switch (type) {
    case "invoice":
      subject = `Your ${appName} Invoice`;
      preheader = `New invoice for ${data.amount}`;
      content = `
        <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #0f172a;">
          Invoice Ready
        </h1>
        <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
          Hi ${data.name || "there"},
        </p>
        <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
          Your invoice for ${data.amount} is ready.
        </p>
        ${data.invoiceUrl ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px auto;">
          <tr>
            <td style="background: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%); border-radius: 8px;">
              <a href="${data.invoiceUrl}" style="display: inline-block; padding: 14px 32px; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none;">
                View Invoice →
              </a>
            </td>
          </tr>
        </table>
        ` : ""}
      `;
      break;

    case "payment_success":
      subject = `Payment Confirmed - ${appName}`;
      preheader = `Thank you! Your payment of ${data.amount} was successful.`;
      content = `
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="display: inline-block; width: 64px; height: 64px; background-color: #dcfce7; border-radius: 50%; line-height: 64px; font-size: 32px;">✓</span>
        </div>
        <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #0f172a; text-align: center;">
          Payment Successful!
        </h1>
        <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6; text-align: center;">
          Thank you for your payment of ${data.amount}.
        </p>
        <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; text-align: center;">
          <p style="margin: 0; color: #475569; font-size: 14px;">
            Plan: <strong>${data.planName || "Standard"}</strong>
          </p>
        </div>
      `;
      break;

    case "payment_failed":
      subject = `Payment Failed - Action Required`;
      preheader = `We couldn't process your payment. Please update your payment method.`;
      content = `
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="display: inline-block; width: 64px; height: 64px; background-color: #fef2f2; border-radius: 50%; line-height: 64px; font-size: 32px;">!</span>
        </div>
        <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #dc2626; text-align: center;">
          Payment Failed
        </h1>
        <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6; text-align: center;">
          We couldn't process your payment of ${data.amount}. Please update your payment method to avoid service interruption.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px auto;">
          <tr>
            <td style="background-color: #dc2626; border-radius: 8px;">
              <a href="${appUrl}/billing" style="display: inline-block; padding: 14px 32px; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none;">
                Update Payment Method →
              </a>
            </td>
          </tr>
        </table>
      `;
      break;

    case "subscription_cancelled":
      subject = `Your ${appName} Subscription Has Been Cancelled`;
      preheader = `We're sorry to see you go.`;
      content = `
        <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #0f172a;">
          Subscription Cancelled
        </h1>
        <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
          Hi ${data.name || "there"},
        </p>
        <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
          Your subscription has been cancelled. You'll continue to have access until ${data.endDate}.
        </p>
        <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0; color: #475569; font-size: 14px;">
            Changed your mind? You can resubscribe anytime from your billing page.
          </p>
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px auto;">
          <tr>
            <td style="background: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%); border-radius: 8px;">
              <a href="${appUrl}/billing" style="display: inline-block; padding: 14px 32px; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none;">
                Resubscribe →
              </a>
            </td>
          </tr>
        </table>
      `;
      break;

    case "trial_ending":
      subject = `Your ${appName} Trial Ends in ${data.daysRemaining} Days`;
      preheader = `Upgrade now to keep your backups running.`;
      content = `
        <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #0f172a;">
          Your Trial is Ending Soon
        </h1>
        <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
          Hi ${data.name || "there"},
        </p>
        <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
          Your free trial ends in <strong>${data.daysRemaining} days</strong>. Upgrade now to continue enjoying all the features of ${appName}.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px auto;">
          <tr>
            <td style="background: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%); border-radius: 8px;">
              <a href="${appUrl}/billing" style="display: inline-block; padding: 14px 32px; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none;">
                Upgrade Now →
              </a>
            </td>
          </tr>
        </table>
      `;
      break;
  }

  const html = wrapInBrandedTemplate(content, { preheader });

  return sendEmail({
    to,
    subject,
    html,
    text: content.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(),
  });
}
