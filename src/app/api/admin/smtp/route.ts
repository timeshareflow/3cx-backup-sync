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

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super admins can view SMTP settings
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createClient();

    const { data: settings, error } = await supabase
      .from("smtp_settings")
      .select("*")
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") { // PGRST116 = no rows returned
      console.error("Error fetching SMTP settings:", error);
      return NextResponse.json(
        { error: "Failed to fetch SMTP settings" },
        { status: 500 }
      );
    }

    // Don't return the actual password, just indicate if it's set
    if (settings) {
      return NextResponse.json({
        settings: {
          ...settings,
          password_encrypted: settings.password_encrypted ? "********" : null,
          has_password: !!settings.password_encrypted,
        },
      });
    }

    return NextResponse.json({ settings: null });
  } catch (error) {
    console.error("Error in SMTP settings API:", error);
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

    // Only super admins can create SMTP settings
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      host,
      port,
      username,
      password,
      from_email,
      from_name,
      encryption,
      is_active,
    } = body;

    if (!host || !from_email) {
      return NextResponse.json(
        { error: "Host and from email are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if settings already exist
    const { data: existing } = await supabase
      .from("smtp_settings")
      .select("id")
      .limit(1)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "SMTP settings already exist. Use PUT to update." },
        { status: 409 }
      );
    }

    const insertData: Record<string, unknown> = {
      host,
      port: port || 587,
      username,
      from_email,
      from_name: from_name || "3CX BackupWiz",
      encryption: encryption || "tls",
      is_active: is_active ?? true,
    };

    if (password) {
      insertData.password_encrypted = encrypt(password);
    }

    const { data: settings, error } = await supabase
      .from("smtp_settings")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("Error creating SMTP settings:", error);
      return NextResponse.json(
        { error: "Failed to create SMTP settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      settings: {
        ...settings,
        password_encrypted: settings.password_encrypted ? "********" : null,
        has_password: !!settings.password_encrypted,
      },
    });
  } catch (error) {
    console.error("Error in SMTP settings API:", error);
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

    // Only super admins can update SMTP settings
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      id,
      host,
      port,
      username,
      password,
      from_email,
      from_name,
      encryption,
      is_active,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Settings ID is required" }, { status: 400 });
    }

    const supabase = await createClient();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (host !== undefined) updateData.host = host;
    if (port !== undefined) updateData.port = port;
    if (username !== undefined) updateData.username = username;
    if (from_email !== undefined) updateData.from_email = from_email;
    if (from_name !== undefined) updateData.from_name = from_name;
    if (encryption !== undefined) updateData.encryption = encryption;
    if (is_active !== undefined) updateData.is_active = is_active;

    // Only update password if a new one is provided
    if (password && password !== "********") {
      updateData.password_encrypted = encrypt(password);
    }

    const { data: settings, error } = await supabase
      .from("smtp_settings")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating SMTP settings:", error);
      return NextResponse.json(
        { error: "Failed to update SMTP settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      settings: {
        ...settings,
        password_encrypted: settings.password_encrypted ? "********" : null,
        has_password: !!settings.password_encrypted,
      },
    });
  } catch (error) {
    console.error("Error in SMTP settings API:", error);
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

    // Only super admins can delete SMTP settings
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
      .from("smtp_settings")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting SMTP settings:", error);
      return NextResponse.json(
        { error: "Failed to delete SMTP settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in SMTP settings API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
