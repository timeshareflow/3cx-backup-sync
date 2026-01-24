import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";

export async function GET() {
  const debug: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  try {
    // Check env vars
    debug.envVars = {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      serviceRoleKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
    };

    // Check auth
    const authClient = await createClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();

    debug.auth = {
      hasUser: !!user,
      userId: user?.id || null,
      userEmail: user?.email || null,
      authError: authError?.message || null,
    };

    if (!user) {
      return NextResponse.json(debug);
    }

    // Check admin client
    let adminClient;
    try {
      adminClient = createAdminClient();
      debug.adminClient = { created: true };
    } catch (e) {
      debug.adminClient = { created: false, error: (e as Error).message };
      return NextResponse.json(debug);
    }

    // Check user profile
    const { data: profile, error: profileError } = await adminClient
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    debug.profile = {
      found: !!profile,
      role: profile?.role || null,
      error: profileError?.message || null,
    };

    // Check tenant cookie
    const cookieStore = await cookies();
    const tenantCookie = cookieStore.get("currentTenantId")?.value || null;
    debug.tenantCookie = tenantCookie;

    // Check user_tenants
    const { data: userTenants, error: tenantsError } = await adminClient
      .from("user_tenants")
      .select("tenant_id, role")
      .eq("user_id", user.id);

    debug.userTenants = {
      count: userTenants?.length || 0,
      tenants: userTenants || [],
      error: tenantsError?.message || null,
    };

    // Check all tenants (if super_admin)
    if (profile?.role === "super_admin") {
      const { data: allTenants } = await adminClient
        .from("tenants")
        .select("id, name, is_active")
        .eq("is_active", true);
      debug.allTenants = allTenants || [];
    }

    // Get the effective tenant ID
    let effectiveTenantId = tenantCookie;
    if (!effectiveTenantId && userTenants && userTenants.length > 0) {
      effectiveTenantId = userTenants[0].tenant_id;
    }
    if (!effectiveTenantId && profile?.role === "super_admin") {
      const { data: firstTenant } = await adminClient
        .from("tenants")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .single();
      effectiveTenantId = firstTenant?.id || null;
    }
    debug.effectiveTenantId = effectiveTenantId;

    // Check data counts for this tenant
    if (effectiveTenantId) {
      const [convResult, msgResult, extResult] = await Promise.all([
        adminClient.from("conversations").select("id", { count: "exact", head: true }).eq("tenant_id", effectiveTenantId),
        adminClient.from("messages").select("id", { count: "exact", head: true }),
        adminClient.from("extensions").select("id", { count: "exact", head: true }).eq("tenant_id", effectiveTenantId),
      ]);

      debug.dataCounts = {
        conversations: convResult.count || 0,
        messages: msgResult.count || 0,
        extensions: extResult.count || 0,
        convError: convResult.error?.message || null,
      };
    }

    return NextResponse.json(debug);
  } catch (error) {
    debug.fatalError = (error as Error).message;
    return NextResponse.json(debug, { status: 500 });
  }
}
