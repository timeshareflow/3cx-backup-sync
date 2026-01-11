import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-encryption-key-change-in-prod";

function decrypt(encryptedText: string): string {
  try {
    const algorithm = "aes-256-cbc";
    const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
    const [ivHex, encrypted] = encryptedText.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return "";
  }
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
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

async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const supabase = await createClient();

  const { data: settings, error } = await supabase
    .from("smtp_settings")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (error || !settings) {
    console.error("No active SMTP settings found:", error);
    return null;
  }

  const config: SmtpConfig = {
    host: settings.host,
    port: settings.port,
    secure: settings.encryption === "ssl",
    from: {
      name: settings.from_name || "3CX BackupWiz",
      email: settings.from_email,
    },
  };

  if (settings.username && settings.password_encrypted) {
    config.auth = {
      user: settings.username,
      pass: decrypt(settings.password_encrypted),
    };
  }

  return config;
}

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const config = await getSmtpConfig();

  if (!config) {
    return {
      success: false,
      error: "SMTP not configured"
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
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
    console.error("Error sending email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function sendTemplatedEmail(
  templateName: string,
  to: string | string[],
  variables: Record<string, string>
): Promise<EmailResult> {
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

export async function testSmtpConnection(): Promise<{ success: boolean; error?: string }> {
  const config = await getSmtpConfig();

  if (!config) {
    return {
      success: false,
      error: "SMTP not configured"
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      tls: {
        rejectUnauthorized: false,
      },
    });

    await transporter.verify();

    return { success: true };
  } catch (error) {
    console.error("SMTP connection test failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
