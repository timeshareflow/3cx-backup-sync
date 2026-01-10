import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type UserRole = "super_admin" | "admin" | "user";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_protected: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserWithTenants extends UserProfile {
  tenants: Array<{
    tenant_id: string;
    role: UserRole;
    tenant: {
      id: string;
      name: string;
      slug: string;
    };
  }>;
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile;
}

export async function getCurrentUserWithTenants(): Promise<UserWithTenants | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select(`
      *,
      tenants:user_tenants(
        tenant_id,
        role,
        tenant:tenants(id, name, slug)
      )
    `)
    .eq("id", user.id)
    .single();

  return profile as UserWithTenants | null;
}

export async function requireAuth(): Promise<UserProfile> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireRole(allowedRoles: UserRole[]): Promise<UserProfile> {
  const user = await requireAuth();

  if (!allowedRoles.includes(user.role)) {
    redirect("/unauthorized");
  }

  return user;
}

export async function requireSuperAdmin(): Promise<UserProfile> {
  return requireRole(["super_admin"]);
}

export async function requireAdmin(): Promise<UserProfile> {
  return requireRole(["super_admin", "admin"]);
}

export function canManageUsers(role: UserRole): boolean {
  return role === "super_admin" || role === "admin";
}

export function canManageTenants(role: UserRole): boolean {
  return role === "super_admin";
}

export function canAccessSettings(role: UserRole): boolean {
  return role === "super_admin" || role === "admin";
}

export function canDeleteUser(currentUserRole: UserRole, targetUserProtected: boolean): boolean {
  if (targetUserProtected) {
    return false; // Protected users cannot be deleted
  }
  return currentUserRole === "super_admin";
}

export function canChangeUserRole(
  currentUserRole: UserRole,
  targetUserRole: UserRole,
  targetUserProtected: boolean
): boolean {
  if (targetUserProtected) {
    return false; // Protected users' roles cannot be changed
  }
  if (currentUserRole === "super_admin") {
    return true;
  }
  if (currentUserRole === "admin" && targetUserRole === "user") {
    return true; // Admins can only modify regular users
  }
  return false;
}
