"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/auth";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_protected: boolean;
}

interface Tenant {
  tenant_id: string;
  role: UserRole;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
}

// For super admin "view as tenant" feature - all tenants in platform
interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  tenants: Tenant[];
  currentTenant: Tenant | null;
  session: Session | null;
  isLoading: boolean;
  passwordChangeRequired: boolean;
  // Super admin specific
  allTenants: PlatformTenant[];
  viewingAsTenant: PlatformTenant | null;
  isViewingAsTenant: boolean;
  setCurrentTenant: (tenant: Tenant) => void;
  setViewingAsTenant: (tenant: PlatformTenant | null) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearPasswordChangeRequired: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);
  // Super admin "view as tenant" state
  const [allTenants, setAllTenants] = useState<PlatformTenant[]>([]);
  const [viewingAsTenant, setViewingAsTenantState] = useState<PlatformTenant | null>(null);

  const supabase = createClient();

  // Fetch all tenants for super admin "view as" feature
  const fetchAllTenants = async () => {
    try {
      const response = await fetch("/api/admin/tenants/all");
      if (response.ok) {
        const data = await response.json();
        setAllTenants(data.tenants || []);

        // Restore viewing as tenant from localStorage
        const savedViewingTenantId = localStorage.getItem("viewingAsTenantId");
        if (savedViewingTenantId && data.tenants) {
          const savedTenant = data.tenants.find((t: PlatformTenant) => t.id === savedViewingTenantId);
          if (savedTenant) {
            setViewingAsTenantState(savedTenant);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch all tenants:", error);
    }
  };

  const fetchProfile = async (userId: string) => {
    const { data: profileData } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileData) {
      setProfile(profileData);

      // If super admin, fetch all tenants for "view as" feature
      if (profileData.role === "super_admin") {
        fetchAllTenants();
      }
    }

    // Fetch user's tenants
    const { data: tenantsData } = await supabase
      .from("user_tenants")
      .select(`
        tenant_id,
        role,
        tenant:tenants(id, name, slug)
      `)
      .eq("user_id", userId);

    if (tenantsData) {
      const formattedTenants = tenantsData as unknown as Tenant[];
      setTenants(formattedTenants);

      // Set first tenant as current if none selected
      if (formattedTenants.length > 0 && !currentTenant) {
        // Try to restore from localStorage
        const savedTenantId = localStorage.getItem("currentTenantId");
        const savedTenant = formattedTenants.find(t => t.tenant_id === savedTenantId);
        setCurrentTenant(savedTenant || formattedTenants[0]);
      }
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      if (initialSession?.user) {
        // Check if password change is required
        const needsPasswordChange = initialSession.user.user_metadata?.password_change_required === true;
        setPasswordChangeRequired(needsPasswordChange);
        fetchProfile(initialSession.user.id);
      }
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (event === "SIGNED_IN" && newSession?.user) {
          // Check if password change is required
          const needsPasswordChange = newSession.user.user_metadata?.password_change_required === true;
          setPasswordChangeRequired(needsPasswordChange);
          await fetchProfile(newSession.user.id);
        } else if (event === "SIGNED_OUT") {
          setProfile(null);
          setTenants([]);
          setCurrentTenant(null);
          setPasswordChangeRequired(false);
        }
      }
    );

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSetCurrentTenant = (tenant: Tenant) => {
    setCurrentTenant(tenant);
    localStorage.setItem("currentTenantId", tenant.tenant_id);
  };

  const handleSetViewingAsTenant = async (tenant: PlatformTenant | null) => {
    setViewingAsTenantState(tenant);
    if (tenant) {
      localStorage.setItem("viewingAsTenantId", tenant.id);
      // Set cookie for server-side access
      document.cookie = `viewingAsTenantId=${tenant.id}; path=/; max-age=${60 * 60 * 24}; samesite=lax`;
    } else {
      localStorage.removeItem("viewingAsTenantId");
      // Clear the cookie
      document.cookie = "viewingAsTenantId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }
    // Refresh the page to apply new context
    window.location.reload();
  };

  const signOut = async () => {
    // Clear local state first to prevent any re-renders from using stale data
    setProfile(null);
    setTenants([]);
    setCurrentTenant(null);
    setAllTenants([]);
    setViewingAsTenantState(null);
    setPasswordChangeRequired(false);
    setUser(null);
    setSession(null);

    // Clear localStorage
    localStorage.removeItem("currentTenantId");
    localStorage.removeItem("viewingAsTenantId");

    // Clear cookies
    document.cookie = "viewingAsTenantId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "currentTenantId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";

    try {
      // Sign out from Supabase with global scope to clear all sessions
      await supabase.auth.signOut({ scope: 'global' });
    } catch (error) {
      console.error("Error during sign out:", error);
      // Continue even if there's an error - we've already cleared local state
    }
  };

  const clearPasswordChangeRequired = async () => {
    // Update user metadata to remove password_change_required flag
    const { error } = await supabase.auth.updateUser({
      data: { password_change_required: false }
    });
    if (!error) {
      setPasswordChangeRequired(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        tenants,
        currentTenant,
        session,
        isLoading,
        passwordChangeRequired,
        // Super admin specific
        allTenants,
        viewingAsTenant,
        isViewingAsTenant: viewingAsTenant !== null,
        setCurrentTenant: handleSetCurrentTenant,
        setViewingAsTenant: handleSetViewingAsTenant,
        signOut,
        refreshProfile,
        clearPasswordChangeRequired,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
