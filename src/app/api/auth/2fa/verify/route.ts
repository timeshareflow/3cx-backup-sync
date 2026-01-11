import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";
import { verifySync } from "otplib";

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

function encrypt(text: string): string {
  const algorithm = "aes-256-cbc";
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

// POST - Verify 2FA code during login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, code, isBackupCode } = body;

    if (!userId || !code) {
      return NextResponse.json(
        { error: "User ID and code are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get user's 2FA settings
    const { data: profile, error: fetchError } = await supabase
      .from("user_profiles")
      .select("totp_secret_encrypted, totp_backup_codes_encrypted, totp_enabled")
      .eq("id", userId)
      .single();

    if (fetchError || !profile) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    if (!profile.totp_enabled || !profile.totp_secret_encrypted) {
      return NextResponse.json(
        { error: "2FA is not enabled for this user" },
        { status: 400 }
      );
    }

    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip");
    const userAgent = request.headers.get("user-agent");

    // Check if it's a backup code
    if (isBackupCode) {
      if (!profile.totp_backup_codes_encrypted) {
        return NextResponse.json(
          { error: "No backup codes available" },
          { status: 400 }
        );
      }

      const backupCodes: string[] = JSON.parse(decrypt(profile.totp_backup_codes_encrypted));
      const codeIndex = backupCodes.findIndex(
        (c) => c.replace("-", "").toUpperCase() === code.replace("-", "").toUpperCase()
      );

      if (codeIndex === -1) {
        // Log failed attempt
        await supabase.from("auth_2fa_logs").insert({
          user_id: userId,
          action: "failed",
          ip_address: ipAddress,
          user_agent: userAgent,
          metadata: { reason: "invalid_backup_code" },
        });

        return NextResponse.json(
          { error: "Invalid backup code" },
          { status: 400 }
        );
      }

      // Remove used backup code
      backupCodes.splice(codeIndex, 1);

      await supabase
        .from("user_profiles")
        .update({
          totp_backup_codes_encrypted: encrypt(JSON.stringify(backupCodes)),
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      // Log backup code usage
      await supabase.from("auth_2fa_logs").insert({
        user_id: userId,
        action: "backup_used",
        ip_address: ipAddress,
        user_agent: userAgent,
        metadata: { remaining_codes: backupCodes.length },
      });

      return NextResponse.json({
        success: true,
        remainingBackupCodes: backupCodes.length,
        message: backupCodes.length < 3
          ? `Verified! Warning: Only ${backupCodes.length} backup codes remaining.`
          : "Verified successfully",
      });
    }

    // Verify TOTP code
    const secret = decrypt(profile.totp_secret_encrypted);
    const isValid = verifySync({ token: code, secret });

    if (!isValid) {
      // Log failed attempt
      await supabase.from("auth_2fa_logs").insert({
        user_id: userId,
        action: "failed",
        ip_address: ipAddress,
        user_agent: userAgent,
        metadata: { reason: "invalid_totp_code" },
      });

      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    // Log successful verification
    await supabase.from("auth_2fa_logs").insert({
      user_id: userId,
      action: "verify",
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return NextResponse.json({
      success: true,
      message: "2FA verification successful",
    });
  } catch (error) {
    console.error("Error in 2FA verify API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
