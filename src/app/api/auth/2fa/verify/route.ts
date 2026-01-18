import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/encryption";
import { verifySync } from "otplib";
import { withRateLimit, parseJsonBody, errorResponse, handleApiError } from "@/lib/api-utils";
import { rateLimitConfigs } from "@/lib/rate-limit";

// POST - Verify 2FA code during login
export async function POST(request: NextRequest) {
  // Rate limit: 10 requests per minute to prevent brute force
  const rateLimited = withRateLimit(request, rateLimitConfigs.auth);
  if (rateLimited) return rateLimited;

  try {
    const parsed = await parseJsonBody<{ userId: string; code: string; isBackupCode?: boolean }>(request);
    if ("error" in parsed) return parsed.error;

    const { userId, code, isBackupCode } = parsed.data;

    if (!userId || !code) {
      return errorResponse("User ID and code are required", 400);
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
    return handleApiError(error, "2FA verify");
  }
}
