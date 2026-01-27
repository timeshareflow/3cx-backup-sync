import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { encrypt } from "@/lib/encryption";

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super admins can view email settings
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = createAdminClient();

    const { data: settings, error } = await supabase
      .from("smtp_settings")
      .select("*")
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching email settings:", error);
      return NextResponse.json(
        { error: "Failed to fetch email settings" },
        { status: 500 }
      );
    }

    // Don't return actual secrets, just indicate if they're set
    if (settings) {
      return NextResponse.json({
        settings: {
          ...settings,
          password_encrypted: settings.password_encrypted ? "********" : null,
          sendgrid_api_key_encrypted: settings.sendgrid_api_key_encrypted ? "********" : null,
          has_password: !!settings.password_encrypted,
          has_sendgrid_api_key: !!settings.sendgrid_api_key_encrypted,
        },
      });
    }

    return NextResponse.json({ settings: null });
  } catch (error) {
    console.error("Error in email settings API:", error);
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

    // Only super admins can create email settings
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      provider,
      host,
      port,
      username,
      password,
      sendgrid_api_key,
      from_email,
      from_name,
      encryption,
      is_active,
    } = body;

    console.log("SMTP POST - received body:", { ...body, password: body.password ? "[REDACTED]" : undefined, sendgrid_api_key: body.sendgrid_api_key ? "[REDACTED]" : undefined });

    if (!from_email) {
      return NextResponse.json(
        { error: "From email is required" },
        { status: 400 }
      );
    }

    // Allow saving without credentials - user can add them later
    // Just warn if provider-specific settings are missing
    const warnings: string[] = [];
    if (provider === "sendgrid" && !sendgrid_api_key) {
      warnings.push("SendGrid API key not set - emails will not be sent until configured");
    }
    if (provider !== "sendgrid" && !host) {
      warnings.push("SMTP host not set - emails will not be sent until configured");
    }

    const supabase = createAdminClient();

    // Check if settings already exist
    const { data: existing } = await supabase
      .from("smtp_settings")
      .select("id")
      .limit(1)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Email settings already exist. Use PUT to update." },
        { status: 409 }
      );
    }

    const insertData: Record<string, unknown> = {
      provider: provider || "smtp",
      host: host || null,
      port: port || 587,
      username: username || null,
      from_email,
      from_name: from_name || "3CX BackupWiz",
      encryption: encryption || "tls",
      is_active: is_active ?? true,
    };

    if (password) {
      insertData.password_encrypted = encrypt(password);
    }

    if (sendgrid_api_key) {
      insertData.sendgrid_api_key_encrypted = encrypt(sendgrid_api_key);
    }

    const { data: settings, error } = await supabase
      .from("smtp_settings")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("Error creating email settings:", error);
      return NextResponse.json(
        { error: `Failed to create email settings: ${error.message}` },
        { status: 500 }
      );
    }

    console.log("SMTP POST - settings saved successfully:", settings.id);

    return NextResponse.json({
      settings: {
        ...settings,
        password_encrypted: settings.password_encrypted ? "********" : null,
        sendgrid_api_key_encrypted: settings.sendgrid_api_key_encrypted ? "********" : null,
        has_password: !!settings.password_encrypted,
        has_sendgrid_api_key: !!settings.sendgrid_api_key_encrypted,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    console.error("Error in email settings API:", error);
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

    // Only super admins can update email settings
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      id,
      provider,
      host,
      port,
      username,
      password,
      sendgrid_api_key,
      from_email,
      from_name,
      encryption,
      is_active,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Settings ID is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (provider !== undefined) updateData.provider = provider;
    if (host !== undefined) updateData.host = host || null;
    if (port !== undefined) updateData.port = port;
    if (username !== undefined) updateData.username = username || null;
    if (from_email !== undefined) updateData.from_email = from_email;
    if (from_name !== undefined) updateData.from_name = from_name;
    if (encryption !== undefined) updateData.encryption = encryption;
    if (is_active !== undefined) updateData.is_active = is_active;

    // Only update password if a new one is provided
    if (password && password !== "********") {
      updateData.password_encrypted = encrypt(password);
    }

    // Only update SendGrid API key if a new one is provided
    if (sendgrid_api_key && sendgrid_api_key !== "********") {
      updateData.sendgrid_api_key_encrypted = encrypt(sendgrid_api_key);
    }

    const { data: settings, error } = await supabase
      .from("smtp_settings")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating email settings:", error);
      return NextResponse.json(
        { error: "Failed to update email settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      settings: {
        ...settings,
        password_encrypted: settings.password_encrypted ? "********" : null,
        sendgrid_api_key_encrypted: settings.sendgrid_api_key_encrypted ? "********" : null,
        has_password: !!settings.password_encrypted,
        has_sendgrid_api_key: !!settings.sendgrid_api_key_encrypted,
      },
    });
  } catch (error) {
    console.error("Error in email settings API:", error);
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

    // Only super admins can delete email settings
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Settings ID is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from("smtp_settings")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting email settings:", error);
      return NextResponse.json(
        { error: "Failed to delete email settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in email settings API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
