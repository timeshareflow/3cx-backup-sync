"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, RefreshCw, LogOut, Settings, ChevronDown, Building2, Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function Header() {
  const router = useRouter();
  const { user, profile, tenants, currentTenant, setCurrentTenant, signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTenantMenu, setShowTenantMenu] = useState(false);
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
    try {
      const response = await fetch("/api/sync/trigger", { method: "POST" });
      if (!response.ok) {
        throw new Error("Sync trigger failed");
      }
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
        return "bg-gradient-to-r from-teal-500 to-cyan-500 text-white";
      case "admin":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <form onSubmit={handleSearch} className="flex-1 max-w-xl">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search messages, conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:outline-none focus:bg-white focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all text-gray-900 placeholder:text-gray-400"
            />
          </div>
        </form>

        <div className="flex items-center gap-3">
          {/* Tenant Selector */}
          {tenants.length > 1 && (
            <div className="relative" ref={tenantMenuRef}>
              <button
                onClick={() => setShowTenantMenu(!showTenantMenu)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-50 border-2 border-gray-100 rounded-xl hover:bg-gray-100 hover:border-gray-200 transition-all"
              >
                <Building2 className="h-4 w-4 text-teal-600" />
                <span className="max-w-[120px] truncate">
                  {currentTenant?.tenant?.name || "Select Tenant"}
                </span>
                <ChevronDown className="h-4 w-4" />
              </button>

              {showTenantMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Switch Tenant</p>
                  </div>
                  {tenants.map((tenant) => (
                    <button
                      key={tenant.tenant_id}
                      onClick={() => {
                        setCurrentTenant(tenant);
                        setShowTenantMenu(false);
                      }}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors ${
                        currentTenant?.tenant_id === tenant.tenant_id ? "bg-teal-50" : ""
                      }`}
                    >
                      <div className={`font-medium ${currentTenant?.tenant_id === tenant.tenant_id ? "text-teal-700" : "text-gray-900"}`}>
                        {tenant.tenant?.name}
                      </div>
                      <div className="text-xs text-gray-500 capitalize">{tenant.role || "member"}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notifications */}
          <button className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-teal-500 rounded-full"></span>
          </button>

          {/* Sync Button */}
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 rounded-xl shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Now"}
          </button>

          {/* User Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
            >
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/20">
                <span className="text-white font-semibold">
                  {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase() || "U"}
                </span>
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-sm font-semibold text-gray-900">
                  {profile?.full_name || user?.email?.split("@")[0] || "User"}
                </div>
                {profile?.role && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getRoleBadgeColor(profile.role)}`}>
                    {profile.role.replace("_", " ")}
                  </span>
                )}
              </div>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50">
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="text-sm font-semibold text-gray-900">
                    {profile?.full_name || "User"}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{user?.email}</div>
                </div>

                {(profile?.role === "super_admin" || profile?.role === "admin") && (
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      router.push("/admin/settings");
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                  >
                    <Settings className="h-4 w-4 text-gray-400" />
                    Settings
                  </button>
                )}

                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
