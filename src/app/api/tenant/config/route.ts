import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

    // Get tenant config using admin client to bypass RLS
    // Fetch BOTH old and new columns for backward compatibility
    const adminClient = createAdminClient();
    const { data: tenant, error } = await adminClient
      .from("tenants")
      .select(`
        id, name, slug,
        threecx_host,
        ssh_port, ssh_user,
        sftp_port, sftp_user,
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

    // Return config with fallback: new columns -> legacy columns -> defaults
    // Note: passwords are not returned for security
    const config = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      // 3CX Server
      threecx_host: tenant.threecx_host || "",
      // SSH credentials (use new columns with fallback to legacy)
      ssh_port: tenant.ssh_port ?? tenant.sftp_port ?? 22,
      ssh_user: tenant.ssh_user || tenant.sftp_user || "",
      // File paths
      threecx_chat_files_path: tenant.threecx_chat_files_path || "/var/lib/3cxpbx/Instance1/Data/Http/Files/Chat Files",
      threecx_recordings_path: tenant.threecx_recordings_path || "/var/lib/3cxpbx/Instance1/Data/Recordings",
      threecx_voicemail_path: tenant.threecx_voicemail_path || "/var/lib/3cxpbx/Instance1/Data/Voicemail",
      threecx_fax_path: tenant.threecx_fax_path || "/var/lib/3cxpbx/Instance1/Data/Fax",
      threecx_meetings_path: tenant.threecx_meetings_path || "/var/lib/3cxpbx/Instance1/Data/Http/Recordings",
      // Backup settings
      backup_chats: tenant.backup_chats ?? true,
      backup_chat_media: tenant.backup_chat_media ?? true,
      backup_recordings: tenant.backup_recordings ?? true,
      backup_voicemails: tenant.backup_voicemails ?? true,
      backup_faxes: tenant.backup_faxes ?? true,
      backup_cdr: tenant.backup_cdr ?? true,
      backup_meetings: tenant.backup_meetings ?? true,
      // Sync settings
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

    // Build update object - write to BOTH old and new columns for compatibility
    const updateData: Record<string, unknown> = {};

    // 3CX Server host
    if (body.threecx_host !== undefined) updateData.threecx_host = body.threecx_host;

    // SSH credentials - write to BOTH new and legacy columns
    if (body.ssh_port !== undefined) {
      const port = parseInt(body.ssh_port) || 22;
      updateData.ssh_port = port;
      updateData.sftp_port = port;  // Keep legacy in sync
    }
    if (body.ssh_user !== undefined) {
      updateData.ssh_user = body.ssh_user;
      updateData.sftp_user = body.ssh_user;  // Keep legacy in sync
    }
    if (body.ssh_password) {
      updateData.ssh_password = body.ssh_password;
      updateData.sftp_password = body.ssh_password;  // Keep legacy in sync
    }

    // PostgreSQL password - write to BOTH new and legacy columns
    if (body.threecx_db_password) {
      updateData.threecx_db_password = body.threecx_db_password;
      updateData.threecx_password = body.threecx_db_password;  // Keep legacy in sync
    }

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

    // Update tenant using admin client to bypass RLS
    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("tenants")
      .update(updateData)
      .eq("id", userTenant.tenant_id);

    if (error) {
      console.error("Error updating tenant:", error);
      throw error;
    }

    // Fetch updated config (with both old and new columns)
    const { data: tenant, error: fetchError } = await adminClient
      .from("tenants")
      .select(`
        id, name, slug,
        threecx_host,
        ssh_port, ssh_user,
        sftp_port, sftp_user,
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
      // 3CX Server
      threecx_host: tenant.threecx_host || "",
      // SSH credentials (fallback to legacy)
      ssh_port: tenant.ssh_port ?? tenant.sftp_port ?? 22,
      ssh_user: tenant.ssh_user || tenant.sftp_user || "",
      // File paths
      threecx_chat_files_path: tenant.threecx_chat_files_path || "",
      threecx_recordings_path: tenant.threecx_recordings_path || "",
      threecx_voicemail_path: tenant.threecx_voicemail_path || "",
      threecx_fax_path: tenant.threecx_fax_path || "",
      threecx_meetings_path: tenant.threecx_meetings_path || "",
      // Backup settings
      backup_chats: tenant.backup_chats ?? true,
      backup_chat_media: tenant.backup_chat_media ?? true,
      backup_recordings: tenant.backup_recordings ?? true,
      backup_voicemails: tenant.backup_voicemails ?? true,
      backup_faxes: tenant.backup_faxes ?? true,
      backup_cdr: tenant.backup_cdr ?? true,
      backup_meetings: tenant.backup_meetings ?? true,
      // Sync settings
      sync_enabled: tenant.sync_enabled ?? true,
      sync_interval_seconds: tenant.sync_interval_seconds || 60,
    };

    return NextResponse.json({ config });
  } catch (error) {
    console.error("Error updating tenant config:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
