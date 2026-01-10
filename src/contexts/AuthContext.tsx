"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/auth";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
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

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  tenants: Tenant[];
  currentTenant: Tenant | null;
  session: Session | null;
  isLoading: boolean;
  setCurrentTenant: (tenant: Tenant) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  const fetchProfile = async (userId: string) => {
    const { data: profileData } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileData) {
      setProfile(profileData);
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
          await fetchProfile(newSession.user.id);
        } else if (event === "SIGNED_OUT") {
          setProfile(null);
          setTenants([]);
          setCurrentTenant(null);
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

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setTenants([]);
    setCurrentTenant(null);
    localStorage.removeItem("currentTenantId");
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
        setCurrentTenant: handleSetCurrentTenant,
        signOut,
        refreshProfile,
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
