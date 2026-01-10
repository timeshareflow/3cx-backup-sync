import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's tenant
    const { data: userTenant } = await supabase
      .from("user_tenants")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .single();

    if (!userTenant) {
      return NextResponse.json({ error: "No tenant found" }, { status: 404 });
    }

    // Check if user is admin for this tenant
    if (userTenant.role !== "admin") {
      // Also check if user is super_admin
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Get tenant config - using dedicated columns that sync service expects
    const { data: tenant, error } = await supabase
      .from("tenants")
      .select(`
        id, name, slug,
        threecx_host, threecx_port, threecx_database, threecx_user,
        threecx_chat_files_path, threecx_recordings_path,
        threecx_voicemail_path, threecx_fax_path, threecx_meetings_path,
        backup_chats, backup_chat_media, backup_recordings,
        backup_voicemails, backup_faxes, backup_cdr, backup_meetings,
        sync_enabled, sync_interval_seconds
      `)
      .eq("id", userTenant.tenant_id)
      .single();

    if (error) {
      throw error;
    }

    // Return config with defaults for null values
    const config = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      threecx_host: tenant.threecx_host || "",
      threecx_port: tenant.threecx_port || 5432,
      threecx_database: tenant.threecx_database || "database_single",
      threecx_user: tenant.threecx_user || "phonesystem",
      threecx_chat_files_path: tenant.threecx_chat_files_path || "/var/lib/3cxpbx/Instance1/Data/Http/Files/Chat Files",
      threecx_recordings_path: tenant.threecx_recordings_path || "/var/lib/3cxpbx/Instance1/Data/Recordings",
      threecx_voicemail_path: tenant.threecx_voicemail_path || "/var/lib/3cxpbx/Instance1/Data/Voicemail",
      threecx_fax_path: tenant.threecx_fax_path || "/var/lib/3cxpbx/Instance1/Data/Fax",
      threecx_meetings_path: tenant.threecx_meetings_path || "/var/lib/3cxpbx/Instance1/Data/Http/Recordings",
      backup_chats: tenant.backup_chats ?? true,
      backup_chat_media: tenant.backup_chat_media ?? true,
      backup_recordings: tenant.backup_recordings ?? true,
      backup_voicemails: tenant.backup_voicemails ?? true,
      backup_faxes: tenant.backup_faxes ?? true,
      backup_cdr: tenant.backup_cdr ?? true,
      backup_meetings: tenant.backup_meetings ?? true,
      sync_enabled: tenant.sync_enabled ?? true,
      sync_interval_seconds: tenant.sync_interval_seconds || 60,
    };

    return NextResponse.json({ config });
  } catch (error) {
    console.error("Error fetching tenant config:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's tenant
    const { data: userTenant } = await supabase
      .from("user_tenants")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .single();

    if (!userTenant) {
      return NextResponse.json({ error: "No tenant found" }, { status: 404 });
    }

    // Check if user is admin for this tenant
    if (userTenant.role !== "admin") {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Build update object with dedicated columns
    const updateData: Record<string, unknown> = {};

    // 3CX Connection settings
    if (body.threecx_host !== undefined) updateData.threecx_host = body.threecx_host;
    if (body.threecx_port !== undefined) updateData.threecx_port = parseInt(body.threecx_port) || 5432;
    if (body.threecx_database !== undefined) updateData.threecx_database = body.threecx_database;
    if (body.threecx_user !== undefined) updateData.threecx_user = body.threecx_user;
    if (body.threecx_password) updateData.threecx_password = body.threecx_password;

    // 3CX File paths
    if (body.threecx_chat_files_path !== undefined) updateData.threecx_chat_files_path = body.threecx_chat_files_path;
    if (body.threecx_recordings_path !== undefined) updateData.threecx_recordings_path = body.threecx_recordings_path;
    if (body.threecx_voicemail_path !== undefined) updateData.threecx_voicemail_path = body.threecx_voicemail_path;
    if (body.threecx_fax_path !== undefined) updateData.threecx_fax_path = body.threecx_fax_path;
    if (body.threecx_meetings_path !== undefined) updateData.threecx_meetings_path = body.threecx_meetings_path;

    // Backup settings
    if (body.backup_chats !== undefined) updateData.backup_chats = body.backup_chats;
    if (body.backup_chat_media !== undefined) updateData.backup_chat_media = body.backup_chat_media;
    if (body.backup_recordings !== undefined) updateData.backup_recordings = body.backup_recordings;
    if (body.backup_voicemails !== undefined) updateData.backup_voicemails = body.backup_voicemails;
    if (body.backup_faxes !== undefined) updateData.backup_faxes = body.backup_faxes;
    if (body.backup_cdr !== undefined) updateData.backup_cdr = body.backup_cdr;
    if (body.backup_meetings !== undefined) updateData.backup_meetings = body.backup_meetings;

    // Sync settings
    if (body.sync_enabled !== undefined) updateData.sync_enabled = body.sync_enabled;
    if (body.sync_interval_seconds !== undefined) updateData.sync_interval_seconds = body.sync_interval_seconds;

    // Update tenant
    const { error } = await supabase
      .from("tenants")
      .update(updateData)
      .eq("id", userTenant.tenant_id);

    if (error) {
      throw error;
    }

    // Fetch updated config
    const { data: tenant, error: fetchError } = await supabase
      .from("tenants")
      .select(`
        id, name, slug,
        threecx_host, threecx_port, threecx_database, threecx_user,
        threecx_chat_files_path, threecx_recordings_path,
        threecx_voicemail_path, threecx_fax_path, threecx_meetings_path,
        backup_chats, backup_chat_media, backup_recordings,
        backup_voicemails, backup_faxes, backup_cdr, backup_meetings,
        sync_enabled, sync_interval_seconds
      `)
      .eq("id", userTenant.tenant_id)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    const config = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      threecx_host: tenant.threecx_host || "",
      threecx_port: tenant.threecx_port || 5432,
      threecx_database: tenant.threecx_database || "database_single",
      threecx_user: tenant.threecx_user || "phonesystem",
      threecx_chat_files_path: tenant.threecx_chat_files_path || "",
      threecx_recordings_path: tenant.threecx_recordings_path || "",
      threecx_voicemail_path: tenant.threecx_voicemail_path || "",
      threecx_fax_path: tenant.threecx_fax_path || "",
      threecx_meetings_path: tenant.threecx_meetings_path || "",
      backup_chats: tenant.backup_chats ?? true,
      backup_chat_media: tenant.backup_chat_media ?? true,
      backup_recordings: tenant.backup_recordings ?? true,
      backup_voicemails: tenant.backup_voicemails ?? true,
      backup_faxes: tenant.backup_faxes ?? true,
      backup_cdr: tenant.backup_cdr ?? true,
      backup_meetings: tenant.backup_meetings ?? true,
      sync_enabled: tenant.sync_enabled ?? true,
      sync_interval_seconds: tenant.sync_interval_seconds || 60,
    };

    return NextResponse.json({ config });
  } catch (error) {
    console.error("Error updating tenant config:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
