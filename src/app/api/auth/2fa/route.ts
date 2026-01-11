import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import crypto from "crypto";
import { generateSecret, generateURI, verifySync } from "otplib";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-encryption-key-change-in-prod";

function encrypt(text: string): string {
  const algorithm = "aes-256-cbc";
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

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

function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

// GET - Get 2FA status
export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated || !context.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    const { data: profile, error } = await supabase
      .from("user_profiles")
      .select("totp_enabled, totp_verified_at")
      .eq("id", context.userId)
      .single();

    if (error) {
      console.error("Error fetching 2FA status:", error);
      return NextResponse.json(
        { error: "Failed to fetch 2FA status" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      enabled: profile?.totp_enabled || false,
      verifiedAt: profile?.totp_verified_at,
    });
  } catch (error) {
    console.error("Error in 2FA status API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Setup 2FA (generate secret)
export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated || !context.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    const supabase = await createClient();

    switch (action) {
      case "setup": {
        // Generate new TOTP secret
        const secret = generateSecret();

        // Get user email from supabase auth
        const { data: { user } } = await supabase.auth.getUser();
        const email = user?.email || "user";

        // Generate QR code URL (otpauth:// format)
        const otpauthUrl = generateURI({ secret, issuer: "3CX BackupWiz", label: email });

        // Store encrypted secret temporarily (not enabled yet)
        const { error } = await supabase
          .from("user_profiles")
          .update({
            totp_secret_encrypted: encrypt(secret),
            totp_enabled: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", context.userId);

        if (error) {
          console.error("Error storing 2FA secret:", error);
          return NextResponse.json(
            { error: "Failed to setup 2FA" },
            { status: 500 }
          );
        }

        // Log the setup attempt
        await supabase.from("auth_2fa_logs").insert({
          user_id: context.userId,
          action: "setup",
          ip_address: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
          user_agent: request.headers.get("user-agent"),
        });

        return NextResponse.json({
          secret,
          otpauthUrl,
          message: "Scan the QR code with your authenticator app, then verify with a code",
        });
      }

      case "verify": {
        // Verify the TOTP code and enable 2FA
        const { code } = body;

        if (!code) {
          return NextResponse.json(
            { error: "Verification code is required" },
            { status: 400 }
          );
        }

        // Get the stored secret
        const { data: profile, error: fetchError } = await supabase
          .from("user_profiles")
          .select("totp_secret_encrypted")
          .eq("id", context.userId)
          .single();

        if (fetchError || !profile?.totp_secret_encrypted) {
          return NextResponse.json(
            { error: "2FA setup not initiated" },
            { status: 400 }
          );
        }

        const secret = decrypt(profile.totp_secret_encrypted);
        const isValid = verifySync({ token: code, secret });

        if (!isValid) {
          // Log failed verification
          await supabase.from("auth_2fa_logs").insert({
            user_id: context.userId,
            action: "failed",
            ip_address: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
            user_agent: request.headers.get("user-agent"),
            metadata: { reason: "invalid_code" },
          });

          return NextResponse.json(
            { error: "Invalid verification code" },
            { status: 400 }
          );
        }

        // Generate backup codes
        const backupCodes = generateBackupCodes(10);

        // Enable 2FA
        const { error: updateError } = await supabase
          .from("user_profiles")
          .update({
            totp_enabled: true,
            totp_verified_at: new Date().toISOString(),
            totp_backup_codes_encrypted: encrypt(JSON.stringify(backupCodes)),
            updated_at: new Date().toISOString(),
          })
          .eq("id", context.userId);

        if (updateError) {
          console.error("Error enabling 2FA:", updateError);
          return NextResponse.json(
            { error: "Failed to enable 2FA" },
            { status: 500 }
          );
        }

        // Log successful verification
        await supabase.from("auth_2fa_logs").insert({
          user_id: context.userId,
          action: "verify",
          ip_address: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
          user_agent: request.headers.get("user-agent"),
        });

        return NextResponse.json({
          success: true,
          backupCodes,
          message: "2FA enabled successfully. Save your backup codes securely.",
        });
      }

      case "disable": {
        // Disable 2FA (requires current password or 2FA code)
        const { code } = body;

        if (!code) {
          return NextResponse.json(
            { error: "Verification code is required to disable 2FA" },
            { status: 400 }
          );
        }

        // Get the stored secret
        const { data: profile, error: fetchError } = await supabase
          .from("user_profiles")
          .select("totp_secret_encrypted, totp_enabled")
          .eq("id", context.userId)
          .single();

        if (fetchError || !profile?.totp_enabled || !profile?.totp_secret_encrypted) {
          return NextResponse.json(
            { error: "2FA is not enabled" },
            { status: 400 }
          );
        }

        const secret = decrypt(profile.totp_secret_encrypted);
        const isValid = verifySync({ token: code, secret });

        if (!isValid) {
          return NextResponse.json(
            { error: "Invalid verification code" },
            { status: 400 }
          );
        }

        // Disable 2FA
        const { error: updateError } = await supabase
          .from("user_profiles")
          .update({
            totp_enabled: false,
            totp_secret_encrypted: null,
            totp_backup_codes_encrypted: null,
            totp_verified_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", context.userId);

        if (updateError) {
          console.error("Error disabling 2FA:", updateError);
          return NextResponse.json(
            { error: "Failed to disable 2FA" },
            { status: 500 }
          );
        }

        // Log disable action
        await supabase.from("auth_2fa_logs").insert({
          user_id: context.userId,
          action: "disable",
          ip_address: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
          user_agent: request.headers.get("user-agent"),
        });

        return NextResponse.json({
          success: true,
          message: "2FA disabled successfully",
        });
      }

      case "regenerate_backup": {
        // Regenerate backup codes
        const { code } = body;

        if (!code) {
          return NextResponse.json(
            { error: "Verification code is required" },
            { status: 400 }
          );
        }

        // Verify the code first
        const { data: profile, error: fetchError } = await supabase
          .from("user_profiles")
          .select("totp_secret_encrypted, totp_enabled")
          .eq("id", context.userId)
          .single();

        if (fetchError || !profile?.totp_enabled || !profile?.totp_secret_encrypted) {
          return NextResponse.json(
            { error: "2FA is not enabled" },
            { status: 400 }
          );
        }

        const secret = decrypt(profile.totp_secret_encrypted);
        const isValid = verifySync({ token: code, secret });

        if (!isValid) {
          return NextResponse.json(
            { error: "Invalid verification code" },
            { status: 400 }
          );
        }

        // Generate new backup codes
        const backupCodes = generateBackupCodes(10);

        const { error: updateError } = await supabase
          .from("user_profiles")
          .update({
            totp_backup_codes_encrypted: encrypt(JSON.stringify(backupCodes)),
            updated_at: new Date().toISOString(),
          })
          .eq("id", context.userId);

        if (updateError) {
          console.error("Error regenerating backup codes:", updateError);
          return NextResponse.json(
            { error: "Failed to regenerate backup codes" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          backupCodes,
          message: "Backup codes regenerated. Save them securely.",
        });
      }

      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error in 2FA API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
