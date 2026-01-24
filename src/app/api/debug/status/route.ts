import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function GET() {
  const debug: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  // Check env vars first - this can't fail
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  debug.envVars = {
    supabaseUrl: supabaseUrl ? supabaseUrl.substring(0, 30) + "..." : "MISSING",
    hasAnonKey: !!anonKey,
    anonKeyLength: anonKey?.length || 0,
    hasServiceRoleKey: !!serviceRoleKey,
    serviceRoleKeyLength: serviceRoleKey?.length || 0,
    serviceRoleKeyStart: serviceRoleKey ? serviceRoleKey.substring(0, 20) + "..." : "MISSING",
  };

  if (!supabaseUrl || !serviceRoleKey) {
    debug.error = "Missing required environment variables";
    return NextResponse.json(debug);
  }

  // Try to create admin client directly
  try {
    const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    debug.adminClientCreated = true;

    // Try a simple query
    const { data: tenants, error: tenantsError } = await adminClient
      .from("tenants")
      .select("id, name, is_active")
      .limit(5);

    debug.tenantsQuery = {
      success: !tenantsError,
      count: tenants?.length || 0,
      data: tenants || [],
      error: tenantsError?.message || null,
    };

    // Try to get conversations count
    const { count: convCount, error: convError } = await adminClient
      .from("conversations")
      .select("id", { count: "exact", head: true });

    debug.conversationsCount = {
      count: convCount || 0,
      error: convError?.message || null,
    };

    // Try to get messages count
    const { count: msgCount, error: msgError } = await adminClient
      .from("messages")
      .select("id", { count: "exact", head: true });

    debug.messagesCount = {
      count: msgCount || 0,
      error: msgError?.message || null,
    };

    // Get user profiles
    const { data: users, error: usersError } = await adminClient
      .from("user_profiles")
      .select("id, email, role")
      .limit(5);

    debug.userProfiles = {
      count: users?.length || 0,
      data: users || [],
      error: usersError?.message || null,
    };

  } catch (error) {
    debug.adminClientError = (error as Error).message;
  }

  return NextResponse.json(debug);
}
