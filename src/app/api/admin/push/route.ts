import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { encrypt } from "@/lib/encryption";

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super admins can view push settings
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createClient();

    const { data: settings, error } = await supabase
      .from("push_settings")
      .select("*")
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching push settings:", error);
      return NextResponse.json(
        { error: "Failed to fetch push settings" },
        { status: 500 }
      );
    }

    if (settings) {
      return NextResponse.json({
        settings: {
          ...settings,
          firebase_private_key_encrypted: settings.firebase_private_key_encrypted ? "********" : null,
          apns_private_key_encrypted: settings.apns_private_key_encrypted ? "********" : null,
          has_firebase_key: !!settings.firebase_private_key_encrypted,
          has_apns_key: !!settings.apns_private_key_encrypted,
        },
      });
    }

    return NextResponse.json({ settings: null });
  } catch (error) {
    console.error("Error in push settings API:", error);
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
      firebase_project_id,
      firebase_private_key,
      firebase_client_email,
      apns_key_id,
      apns_team_id,
      apns_private_key,
      is_active,
    } = body;

    const supabase = await createClient();

    // Check if settings already exist
    const { data: existing } = await supabase
      .from("push_settings")
      .select("id")
      .limit(1)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Push settings already exist. Use PUT to update." },
        { status: 409 }
      );
    }

    const insertData: Record<string, unknown> = {
      provider: provider || "firebase",
      firebase_project_id,
      firebase_client_email,
      apns_key_id,
      apns_team_id,
      is_active: is_active ?? true,
    };

    if (firebase_private_key) {
      insertData.firebase_private_key_encrypted = encrypt(firebase_private_key);
    }
    if (apns_private_key) {
      insertData.apns_private_key_encrypted = encrypt(apns_private_key);
    }

    const { data: settings, error } = await supabase
      .from("push_settings")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("Error creating push settings:", error);
      return NextResponse.json(
        { error: "Failed to create push settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      settings: {
        ...settings,
        firebase_private_key_encrypted: settings.firebase_private_key_encrypted ? "********" : null,
        apns_private_key_encrypted: settings.apns_private_key_encrypted ? "********" : null,
        has_firebase_key: !!settings.firebase_private_key_encrypted,
        has_apns_key: !!settings.apns_private_key_encrypted,
      },
    });
  } catch (error) {
    console.error("Error in push settings API:", error);
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
      firebase_project_id,
      firebase_private_key,
      firebase_client_email,
      apns_key_id,
      apns_team_id,
      apns_private_key,
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
    if (firebase_project_id !== undefined) updateData.firebase_project_id = firebase_project_id;
    if (firebase_client_email !== undefined) updateData.firebase_client_email = firebase_client_email;
    if (apns_key_id !== undefined) updateData.apns_key_id = apns_key_id;
    if (apns_team_id !== undefined) updateData.apns_team_id = apns_team_id;
    if (is_active !== undefined) updateData.is_active = is_active;

    if (firebase_private_key && firebase_private_key !== "********") {
      updateData.firebase_private_key_encrypted = encrypt(firebase_private_key);
    }
    if (apns_private_key && apns_private_key !== "********") {
      updateData.apns_private_key_encrypted = encrypt(apns_private_key);
    }

    const { data: settings, error } = await supabase
      .from("push_settings")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating push settings:", error);
      return NextResponse.json(
        { error: "Failed to update push settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      settings: {
        ...settings,
        firebase_private_key_encrypted: settings.firebase_private_key_encrypted ? "********" : null,
        apns_private_key_encrypted: settings.apns_private_key_encrypted ? "********" : null,
        has_firebase_key: !!settings.firebase_private_key_encrypted,
        has_apns_key: !!settings.apns_private_key_encrypted,
      },
    });
  } catch (error) {
    console.error("Error in push settings API:", error);
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
      .from("push_settings")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting push settings:", error);
      return NextResponse.json(
        { error: "Failed to delete push settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in push settings API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
