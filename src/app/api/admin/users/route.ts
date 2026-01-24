import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Check user's role - both global and tenant-specific
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", context.userId)
      .single();

    const isSuperAdmin = profile?.role === "super_admin";

    // Check tenant role if not super admin
    let isTenantAdmin = false;
    if (!isSuperAdmin && context.tenantId) {
      const { data: tenantRole } = await supabase
        .from("user_tenants")
        .select("role")
        .eq("user_id", context.userId)
        .eq("tenant_id", context.tenantId)
        .single();
      isTenantAdmin = tenantRole?.role === "admin";
    }

    if (!isSuperAdmin && !isTenantAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Super admins see all users (for platform management)
    if (isSuperAdmin) {
      const { data: users, error } = await supabase
        .from("user_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return NextResponse.json({ data: users });
    }

    // Tenant admins only see users in their tenant (excluding super_admins)
    if (!context.tenantId) {
      return NextResponse.json({ data: [] });
    }

    // Get users that belong to this tenant
    const { data: tenantUsers, error: tenantError } = await supabase
      .from("user_tenants")
      .select(`
        user_id,
        role,
        user:user_profiles (
          id,
          email,
          full_name,
          role,
          is_protected,
          is_active,
          created_at,
          updated_at
        )
      `)
      .eq("tenant_id", context.tenantId);

    if (tenantError) throw tenantError;

    // Transform and filter out super_admins
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const users = ((tenantUsers || []) as any[])
      .filter(tu => tu.user && tu.user.role !== "super_admin") // Exclude platform super admins
      .map(tu => ({
        ...tu.user,
        tenant_role: tu.role, // Include their role in this tenant
      }))
      .sort((a: { created_at: string }, b: { created_at: string }) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    return NextResponse.json({ data: users });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
