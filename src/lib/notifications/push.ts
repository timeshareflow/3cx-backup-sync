import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import crypto from "crypto";

interface FirebaseConfig {
  projectId: string;
  privateKey: string;
  clientEmail: string;
}

interface PushOptions {
  userId?: string;
  token?: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
  sound?: string;
}

interface PushResult {
  success: boolean;
  sent: number;
  failed: number;
  errors?: string[];
}

async function getFirebaseConfig(): Promise<FirebaseConfig | null> {
  const supabase = await createClient();

  const { data: settings, error } = await supabase
    .from("push_settings")
    .select("*")
    .eq("is_active", true)
    .eq("provider", "firebase")
    .limit(1)
    .single();

  if (error || !settings) {
    console.error("No active Firebase push settings found:", error);
    return null;
  }

  if (!settings.firebase_project_id || !settings.firebase_private_key_encrypted || !settings.firebase_client_email) {
    console.error("Firebase configuration incomplete");
    return null;
  }

  return {
    projectId: settings.firebase_project_id,
    privateKey: decrypt(settings.firebase_private_key_encrypted),
    clientEmail: settings.firebase_client_email,
  };
}

async function getAccessToken(config: FirebaseConfig): Promise<string | null> {
  try {
    // Create JWT for Firebase OAuth2
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600; // 1 hour

    const header = {
      alg: "RS256",
      typ: "JWT",
    };

    const payload = {
      iss: config.clientEmail,
      sub: config.clientEmail,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: expiry,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");

    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(signatureInput);
    const signature = signer.sign(config.privateKey, "base64url");

    const jwt = `${signatureInput}.${signature}`;

    // Exchange JWT for access token
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("Failed to get Firebase access token:", error);
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Error getting Firebase access token:", error);
    return null;
  }
}

async function getUserTokens(userId: string): Promise<string[]> {
  const supabase = await createClient();

  const { data: tokens, error } = await supabase
    .from("user_push_tokens")
    .select("token")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error || !tokens) {
    return [];
  }

  return tokens.map(t => t.token);
}

async function sendFirebasePush(
  config: FirebaseConfig,
  tokens: string[],
  options: PushOptions
): Promise<PushResult> {
  const accessToken = await getAccessToken(config);

  if (!accessToken) {
    return {
      success: false,
      sent: 0,
      failed: tokens.length,
      errors: ["Failed to authenticate with Firebase"],
    };
  }

  const results: { success: boolean; error?: string }[] = [];

  // Send to each token
  for (const token of tokens) {
    try {
      const message = {
        message: {
          token,
          notification: {
            title: options.title,
            body: options.body,
          },
          data: options.data || {},
          android: {
            notification: {
              sound: options.sound || "default",
            },
          },
          apns: {
            payload: {
              aps: {
                badge: options.badge,
                sound: options.sound || "default",
              },
            },
          },
        },
      };

      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify(message),
        }
      );

      if (response.ok) {
        results.push({ success: true });
      } else {
        const error = await response.json().catch(() => ({}));
        results.push({
          success: false,
          error: error.error?.message || `HTTP ${response.status}`,
        });

        // If token is invalid, deactivate it
        if (response.status === 404 || error.error?.code === "UNREGISTERED") {
          await deactivateToken(token);
        }
      }
    } catch (error) {
      results.push({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const sent = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const errors = results.filter(r => r.error).map(r => r.error!);

  return {
    success: sent > 0,
    sent,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  };
}

async function deactivateToken(token: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("user_push_tokens")
    .update({ is_active: false })
    .eq("token", token);
}

export async function sendPushNotification(options: PushOptions): Promise<PushResult> {
  const config = await getFirebaseConfig();

  if (!config) {
    return {
      success: false,
      sent: 0,
      failed: 1,
      errors: ["Push notifications not configured"],
    };
  }

  // Get tokens either from userId or use provided token
  let tokens: string[] = [];

  if (options.userId) {
    tokens = await getUserTokens(options.userId);
  } else if (options.token) {
    tokens = [options.token];
  }

  if (tokens.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ["No push tokens found for user"],
    };
  }

  return sendFirebasePush(config, tokens, options);
}

export async function sendPushToMultipleUsers(
  userIds: string[],
  options: Omit<PushOptions, "userId" | "token">
): Promise<PushResult> {
  const config = await getFirebaseConfig();

  if (!config) {
    return {
      success: false,
      sent: 0,
      failed: userIds.length,
      errors: ["Push notifications not configured"],
    };
  }

  // Collect all tokens for all users
  const allTokens: string[] = [];
  for (const userId of userIds) {
    const tokens = await getUserTokens(userId);
    allTokens.push(...tokens);
  }

  if (allTokens.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ["No push tokens found for any users"],
    };
  }

  return sendFirebasePush(config, allTokens, options as PushOptions);
}

export async function registerPushToken(
  userId: string,
  token: string,
  platform: "ios" | "android" | "web",
  deviceName?: string
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("user_push_tokens")
    .upsert(
      {
        user_id: userId,
        token,
        platform,
        device_name: deviceName,
        is_active: true,
        last_used_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,token",
      }
    );

  if (error) {
    console.error("Error registering push token:", error);
    return false;
  }

  return true;
}

export async function unregisterPushToken(userId: string, token: string): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("user_push_tokens")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("token", token);

  if (error) {
    console.error("Error unregistering push token:", error);
    return false;
  }

  return true;
}

export async function testPushConnection(): Promise<{ success: boolean; error?: string }> {
  const config = await getFirebaseConfig();

  if (!config) {
    return {
      success: false,
      error: "Push notifications not configured",
    };
  }

  const accessToken = await getAccessToken(config);

  if (!accessToken) {
    return {
      success: false,
      error: "Failed to authenticate with Firebase",
    };
  }

  return { success: true };
}
