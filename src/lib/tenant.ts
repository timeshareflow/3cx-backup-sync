import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";

export interface TenantContext {
  userId: string;
  tenantId: string | null;
  role: "super_admin" | "admin" | "user";
  isAuthenticated: boolean;
  isSystemWide: boolean; // True for super_admins when no tenant is selected
}

export async function getTenantContext(): Promise<TenantContext> {
  // Use regular client for auth (needs cookies for session)
  const authClient = await createClient();

  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return {
      userId: "",
      tenantId: null,
      role: "user",
      isAuthenticated: false,
      isSystemWide: false,
    };
  }

  // Use admin client for database queries to bypass RLS
  const supabase = createAdminClient();

  // Get user profile and role
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSuperAdmin = profile?.role === "super_admin";

  // Get cookies
  const cookieStore = await cookies();
  let currentTenantId: string | null = null;

  if (isSuperAdmin) {
    // Super admins: Check for "viewing as tenant" cookie first
    const viewingAsTenantId = cookieStore.get("viewingAsTenantId")?.value;
    if (viewingAsTenantId) {
      // Verify the tenant exists
      const { data: tenant } = await supabase
        .from("tenants")
        .select("id")
        .eq("id", viewingAsTenantId)
        .single();

      if (tenant) {
        currentTenantId = viewingAsTenantId;
      }
    }
    // If no viewing as tenant, super admins operate at platform level (null tenant)
  } else {
    // Regular users: Get tenant from cookie or first available
    currentTenantId = cookieStore.get("currentTenantId")?.value || null;

    if (!currentTenantId) {
      // Get first tenant the user has access to
      const { data: userTenants } = await supabase
        .from("user_tenants")
        .select("tenant_id")
        .eq("user_id", user.id)
        .limit(1);

      currentTenantId = userTenants?.[0]?.tenant_id || null;
    } else {
      // Verify user has access to this tenant
      const { data: access } = await supabase
        .from("user_tenants")
        .select("tenant_id")
        .eq("user_id", user.id)
        .eq("tenant_id", currentTenantId)
        .single();

      if (!access) {
        // User doesn't have access, get first available tenant
        const { data: userTenants } = await supabase
          .from("user_tenants")
          .select("tenant_id")
          .eq("user_id", user.id)
          .limit(1);

        currentTenantId = userTenants?.[0]?.tenant_id || null;
      }
    }
  }

  // Super admins are "system wide" when they haven't selected a specific tenant to view as
  const isSystemWide = isSuperAdmin && !currentTenantId;

  return {
    userId: user.id,
    tenantId: currentTenantId,
    role: profile?.role || "user",
    isAuthenticated: true,
    isSystemWide,
  };
}

export async function requireTenantContext(): Promise<TenantContext & { tenantId: string }> {
  const context = await getTenantContext();

  if (!context.isAuthenticated) {
    throw new Error("Unauthorized");
  }

  if (!context.tenantId) {
    throw new Error("No tenant access");
  }

  return context as TenantContext & { tenantId: string };
}
