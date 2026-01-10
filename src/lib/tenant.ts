import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export interface TenantContext {
  userId: string;
  tenantId: string | null;
  role: "super_admin" | "admin" | "user";
  isAuthenticated: boolean;
}

export async function getTenantContext(): Promise<TenantContext> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      userId: "",
      tenantId: null,
      role: "user",
      isAuthenticated: false,
    };
  }

  // Get user profile and role
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isSuperAdmin = profile?.role === "super_admin";

  // Get the current tenant from cookie or first available tenant
  const cookieStore = await cookies();
  let currentTenantId = cookieStore.get("currentTenantId")?.value || null;

  // If no cookie, get first tenant the user has access to
  if (!currentTenantId) {
    if (isSuperAdmin) {
      // Super admins can access all tenants - get the first active one
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id")
        .eq("is_active", true)
        .limit(1);

      currentTenantId = tenants?.[0]?.id || null;
    } else {
      const { data: userTenants } = await supabase
        .from("user_tenants")
        .select("tenant_id")
        .eq("user_id", user.id)
        .limit(1);

      currentTenantId = userTenants?.[0]?.tenant_id || null;
    }
  } else {
    // Verify user has access to this tenant
    if (isSuperAdmin) {
      // Super admins can access any tenant - just verify it exists
      const { data: tenant } = await supabase
        .from("tenants")
        .select("id")
        .eq("id", currentTenantId)
        .single();

      if (!tenant) {
        // Tenant doesn't exist, get first available
        const { data: tenants } = await supabase
          .from("tenants")
          .select("id")
          .eq("is_active", true)
          .limit(1);

        currentTenantId = tenants?.[0]?.id || null;
      }
    } else {
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

  return {
    userId: user.id,
    tenantId: currentTenantId,
    role: profile?.role || "user",
    isAuthenticated: true,
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
