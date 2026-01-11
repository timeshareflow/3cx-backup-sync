import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import crypto from "crypto";

// Simple encryption for sensitive data
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

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super admins can view SMS settings
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createClient();

    const { data: settings, error } = await supabase
      .from("sms_settings")
      .select("*")
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching SMS settings:", error);
      return NextResponse.json(
        { error: "Failed to fetch SMS settings" },
        { status: 500 }
      );
    }

    if (settings) {
      return NextResponse.json({
        settings: {
          ...settings,
          api_key_encrypted: settings.api_key_encrypted ? "********" : null,
          api_secret_encrypted: settings.api_secret_encrypted ? "********" : null,
          has_api_key: !!settings.api_key_encrypted,
          has_api_secret: !!settings.api_secret_encrypted,
        },
      });
    }

    return NextResponse.json({ settings: null });
  } catch (error) {
    console.error("Error in SMS settings API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      provider,
      api_key,
      api_secret,
      from_number,
      webhook_url,
      is_active,
    } = body;

    const supabase = await createClient();

    // Check if settings already exist
    const { data: existing } = await supabase
      .from("sms_settings")
      .select("id")
      .limit(1)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "SMS settings already exist. Use PUT to update." },
        { status: 409 }
      );
    }

    const insertData: Record<string, unknown> = {
      provider: provider || "wiretap",
      from_number,
      webhook_url,
      is_active: is_active ?? true,
    };

    if (api_key) {
      insertData.api_key_encrypted = encrypt(api_key);
    }
    if (api_secret) {
      insertData.api_secret_encrypted = encrypt(api_secret);
    }

    const { data: settings, error } = await supabase
      .from("sms_settings")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("Error creating SMS settings:", error);
      return NextResponse.json(
        { error: "Failed to create SMS settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      settings: {
        ...settings,
        api_key_encrypted: settings.api_key_encrypted ? "********" : null,
        api_secret_encrypted: settings.api_secret_encrypted ? "********" : null,
        has_api_key: !!settings.api_key_encrypted,
        has_api_secret: !!settings.api_secret_encrypted,
      },
    });
  } catch (error) {
    console.error("Error in SMS settings API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      id,
      provider,
      api_key,
      api_secret,
      from_number,
      webhook_url,
      is_active,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Settings ID is required" }, { status: 400 });
    }

    const supabase = await createClient();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (provider !== undefined) updateData.provider = provider;
    if (from_number !== undefined) updateData.from_number = from_number;
    if (webhook_url !== undefined) updateData.webhook_url = webhook_url;
    if (is_active !== undefined) updateData.is_active = is_active;

    if (api_key && api_key !== "********") {
      updateData.api_key_encrypted = encrypt(api_key);
    }
    if (api_secret && api_secret !== "********") {
      updateData.api_secret_encrypted = encrypt(api_secret);
    }

    const { data: settings, error } = await supabase
      .from("sms_settings")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating SMS settings:", error);
      return NextResponse.json(
        { error: "Failed to update SMS settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      settings: {
        ...settings,
        api_key_encrypted: settings.api_key_encrypted ? "********" : null,
        api_secret_encrypted: settings.api_secret_encrypted ? "********" : null,
        has_api_key: !!settings.api_key_encrypted,
        has_api_secret: !!settings.api_secret_encrypted,
      },
    });
  } catch (error) {
    console.error("Error in SMS settings API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Settings ID is required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("sms_settings")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting SMS settings:", error);
      return NextResponse.json(
        { error: "Failed to delete SMS settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in SMS settings API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
