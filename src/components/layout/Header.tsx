"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  RefreshCw,
  LogOut,
  Settings,
  ChevronDown,
  Building2,
  Bell,
  User,
  Sparkles,
  Check,
  Zap,
  Globe,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function Header() {
  const router = useRouter();
  const {
    user,
    profile,
    tenants,
    currentTenant,
    setCurrentTenant,
    signOut,
    // Super admin specific
    allTenants,
    viewingAsTenant,
    isViewingAsTenant,
    setViewingAsTenant,
  } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncTriggered, setSyncTriggered] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTenantMenu, setShowTenantMenu] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const tenantMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (tenantMenuRef.current && !tenantMenuRef.current.contains(event.target as Node)) {
        setShowTenantMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncTriggered(false);
    try {
      const response = await fetch("/api/sync/trigger", { method: "POST" });
      if (!response.ok) {
        throw new Error("Sync trigger failed");
      }
      // Show success state briefly
      setSyncTriggered(true);
      setTimeout(() => setSyncTriggered(false), 3000);
    } catch (error) {
      console.error("Failed to trigger sync:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    // Use full page reload to ensure cookies are cleared and middleware runs fresh
    window.location.href = "/login";
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "super_admin":
        return "bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg shadow-violet-500/25";
      case "admin":
        return "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/25";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  return (
    <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/50 px-6 py-4 sticky top-0 z-40">
      <div className="flex items-center justify-between gap-4">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-xl">
          <div className={`relative transition-all duration-300 ${searchFocused ? "transform scale-[1.02]" : ""}`}>
            <div className={`absolute inset-0 bg-gradient-to-r from-teal-500/20 to-cyan-500/20 rounded-2xl blur-xl transition-opacity duration-300 ${searchFocused ? "opacity-100" : "opacity-0"}`} />
            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors duration-200 ${searchFocused ? "text-teal-500" : "text-slate-400"}`} />
            <input
              type="text"
              placeholder="Search messages, conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="relative w-full pl-12 pr-4 py-3.5 bg-slate-50/80 border-2 border-slate-100 rounded-2xl focus:outline-none focus:bg-white focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all text-slate-800 placeholder:text-slate-400 font-medium"
            />
          </div>
        </form>

        <div className="flex items-center gap-3">
          {/* Super Admin Tenant Selector - View as any tenant or platform-wide */}
          {profile?.role === "super_admin" && allTenants.length > 0 && (
            <div className="relative" ref={tenantMenuRef}>
              <button
                onClick={() => setShowTenantMenu(!showTenantMenu)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl transition-all ${
                  isViewingAsTenant
                    ? "text-violet-700 bg-violet-50 border-2 border-violet-200 hover:bg-violet-100"
                    : "text-slate-700 bg-slate-50 border-2 border-slate-100 hover:bg-white hover:border-slate-200 hover:shadow-lg hover:shadow-slate-200/50"
                }`}
              >
                <div className={`p-1 rounded-lg ${isViewingAsTenant ? "bg-gradient-to-br from-violet-500 to-purple-600" : "bg-gradient-to-br from-slate-500 to-slate-600"}`}>
                  {isViewingAsTenant ? (
                    <Building2 className="h-3.5 w-3.5 text-white" />
                  ) : (
                    <Globe className="h-3.5 w-3.5 text-white" />
                  )}
                </div>
                <span className="max-w-[150px] truncate">
                  {isViewingAsTenant ? viewingAsTenant?.name : "All Tenants"}
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showTenantMenu ? "rotate-180" : ""}`} />
              </button>

              {showTenantMenu && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200 max-h-[400px] overflow-y-auto">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">View as Tenant</p>
                    <p className="text-xs text-slate-500 mt-1">Select a tenant to view their data</p>
                  </div>

                  {/* Platform-wide view option */}
                  <button
                    onClick={() => {
                      setViewingAsTenant(null);
                      setShowTenantMenu(false);
                    }}
                    className={`w-full text-left px-4 py-3.5 text-sm hover:bg-slate-50 transition-colors flex items-center gap-3 ${
                      !isViewingAsTenant ? "bg-slate-100" : ""
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${!isViewingAsTenant ? "bg-slate-700" : "bg-slate-100"}`}>
                      <Globe className={`h-4 w-4 ${!isViewingAsTenant ? "text-white" : "text-slate-500"}`} />
                    </div>
                    <div className="flex-1">
                      <div className={`font-semibold ${!isViewingAsTenant ? "text-slate-900" : "text-slate-700"}`}>
                        All Tenants (Platform View)
                      </div>
                      <div className="text-xs text-slate-500">See platform-wide data</div>
                    </div>
                    {!isViewingAsTenant && (
                      <Check className="h-5 w-5 text-slate-700" />
                    )}
                  </button>

                  <div className="border-t border-slate-100 my-2" />

                  {/* Tenant list */}
                  {allTenants.map((tenant) => (
                    <button
                      key={tenant.id}
                      onClick={() => {
                        setViewingAsTenant(tenant);
                        setShowTenantMenu(false);
                      }}
                      className={`w-full text-left px-4 py-3.5 text-sm hover:bg-slate-50 transition-colors flex items-center gap-3 ${
                        viewingAsTenant?.id === tenant.id ? "bg-violet-50" : ""
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${viewingAsTenant?.id === tenant.id ? "bg-violet-500" : "bg-slate-100"}`}>
                        <Building2 className={`h-4 w-4 ${viewingAsTenant?.id === tenant.id ? "text-white" : "text-slate-500"}`} />
                      </div>
                      <div className="flex-1">
                        <div className={`font-semibold ${viewingAsTenant?.id === tenant.id ? "text-violet-700" : "text-slate-900"}`}>
                          {tenant.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {tenant.is_active ? "Active" : "Inactive"}
                        </div>
                      </div>
                      {viewingAsTenant?.id === tenant.id && (
                        <Check className="h-5 w-5 text-violet-500" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Regular Tenant Selector - Only show for non-super admins with multiple tenants */}
          {profile?.role !== "super_admin" && tenants.length > 1 && (
            <div className="relative" ref={tenantMenuRef}>
              <button
                onClick={() => setShowTenantMenu(!showTenantMenu)}
                className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700 bg-slate-50 border-2 border-slate-100 rounded-xl hover:bg-white hover:border-slate-200 hover:shadow-lg hover:shadow-slate-200/50 transition-all"
              >
                <div className="p-1 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg">
                  <Building2 className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="max-w-[120px] truncate">
                  {currentTenant?.tenant?.name || "Select Tenant"}
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showTenantMenu ? "rotate-180" : ""}`} />
              </button>

              {showTenantMenu && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Switch Workspace</p>
                  </div>
                  {tenants.map((tenant) => (
                    <button
                      key={tenant.tenant_id}
                      onClick={() => {
                        setCurrentTenant(tenant);
                        setShowTenantMenu(false);
                      }}
                      className={`w-full text-left px-4 py-3.5 text-sm hover:bg-slate-50 transition-colors flex items-center gap-3 ${
                        currentTenant?.tenant_id === tenant.tenant_id ? "bg-teal-50" : ""
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${currentTenant?.tenant_id === tenant.tenant_id ? "bg-teal-500" : "bg-slate-100"}`}>
                        <Building2 className={`h-4 w-4 ${currentTenant?.tenant_id === tenant.tenant_id ? "text-white" : "text-slate-500"}`} />
                      </div>
                      <div className="flex-1">
                        <div className={`font-semibold ${currentTenant?.tenant_id === tenant.tenant_id ? "text-teal-700" : "text-slate-900"}`}>
                          {tenant.tenant?.name}
                        </div>
                        <div className="text-xs text-slate-500 capitalize">{tenant.role || "member"}</div>
                      </div>
                      {currentTenant?.tenant_id === tenant.tenant_id && (
                        <Check className="h-5 w-5 text-teal-500" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notifications */}
          <button className="relative p-3 text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-white border-2 border-slate-100 hover:border-slate-200 rounded-xl transition-all hover:shadow-lg hover:shadow-slate-200/50 group">
            <Bell className="h-5 w-5 group-hover:animate-wiggle" />
            <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-gradient-to-r from-rose-500 to-pink-500 rounded-full border-2 border-white shadow-lg shadow-rose-500/50" />
          </button>

          {/* Sync Button */}
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className={`flex items-center gap-2.5 px-5 py-3 text-sm font-bold text-white rounded-xl shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              syncTriggered
                ? "bg-gradient-to-r from-emerald-500 to-green-600 shadow-emerald-500/30"
                : "bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 shadow-teal-500/30 hover:shadow-teal-500/50 hover:scale-105"
            }`}
          >
            {syncTriggered ? (
              <>
                <Check className="h-4 w-4" />
                Synced!
              </>
            ) : (
              <>
                <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync Now"}
              </>
            )}
          </button>

          {/* User Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-3 p-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-xl transition-all group"
            >
              {/* Avatar */}
              <div className="relative">
                <div className="h-11 w-11 rounded-xl overflow-hidden ring-2 ring-slate-100 group-hover:ring-teal-500/30 transition-all shadow-lg">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center">
                      <span className="text-white font-bold text-lg">
                        {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase() || "U"}
                      </span>
                    </div>
                  )}
                </div>
                {/* Online indicator */}
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white shadow-lg shadow-emerald-500/50" />
              </div>

              <div className="text-left hidden sm:block">
                <div className="text-sm font-bold text-slate-800">
                  {profile?.full_name || user?.email?.split("@")[0] || "User"}
                </div>
                {profile?.role && (
                  <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${getRoleBadgeColor(profile.role)}`}>
                    {profile.role === "super_admin" && <Sparkles className="h-2.5 w-2.5" />}
                    {profile.role.replace("_", " ")}
                  </span>
                )}
              </div>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${showUserMenu ? "rotate-180" : ""}`} />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                {/* User Info Header */}
                <div className="px-4 py-4 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl overflow-hidden ring-2 ring-slate-100 shadow-lg">
                      {profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt="Profile"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center">
                          <span className="text-white font-bold text-lg">
                            {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase() || "U"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">
                        {profile?.full_name || "User"}
                      </div>
                      <div className="text-xs text-slate-500 truncate max-w-[150px]">{user?.email}</div>
                    </div>
                  </div>
                </div>

                {/* Menu Items */}
                <div className="py-2">
                  <Link
                    href="/profile"
                    onClick={() => setShowUserMenu(false)}
                    className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors group"
                  >
                    <div className="p-2 bg-slate-100 group-hover:bg-teal-100 rounded-lg transition-colors">
                      <User className="h-4 w-4 text-slate-500 group-hover:text-teal-600 transition-colors" />
                    </div>
                    <div>
                      <div className="font-semibold">My Profile</div>
                      <div className="text-xs text-slate-500">Edit your account settings</div>
                    </div>
                  </Link>

                  {(profile?.role === "super_admin" || profile?.role === "admin") && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        router.push("/admin/settings");
                      }}
                      className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors group"
                    >
                      <div className="p-2 bg-slate-100 group-hover:bg-blue-100 rounded-lg transition-colors">
                        <Settings className="h-4 w-4 text-slate-500 group-hover:text-blue-600 transition-colors" />
                      </div>
                      <div>
                        <div className="font-semibold">Settings</div>
                        <div className="text-xs text-slate-500">App configuration</div>
                      </div>
                    </button>
                  )}
                </div>

                {/* Sign Out */}
                <div className="border-t border-slate-100 pt-2 mt-2">
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors group"
                  >
                    <div className="p-2 bg-red-50 group-hover:bg-red-100 rounded-lg transition-colors">
                      <LogOut className="h-4 w-4 text-red-500" />
                    </div>
                    <div className="font-semibold">Sign out</div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
