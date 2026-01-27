"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare,
  Search,
  Users,
  Settings,
  Activity,
  LayoutDashboard,
  Building2,
  UserCog,
  Shield,
  LogOut,
  Image,
  BarChart3,
  CreditCard,
  Phone,
  Voicemail,
  FileText,
  Video,
  PhoneCall,
  Columns,
  User,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  requiredRoles?: string[];
  badge?: string;
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Conversations", href: "/conversations", icon: MessageSquare },
  { name: "Monitor", href: "/monitor", icon: Columns },
  { name: "Media", href: "/media", icon: Image },
  { name: "Search", href: "/search", icon: Search },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Extensions", href: "/extensions", icon: Users },
];

const communicationsNavigation: NavItem[] = [
  { name: "Call Recordings", href: "/recordings", icon: Phone },
  { name: "Voicemails", href: "/voicemails", icon: Voicemail },
  { name: "Faxes", href: "/faxes", icon: FileText },
  { name: "Call Logs", href: "/call-logs", icon: PhoneCall },
  { name: "Meetings", href: "/meetings", icon: Video },
];

const adminNavigation: NavItem[] = [
  { name: "3CX Setup", href: "/setup", icon: Settings, requiredRoles: ["admin"] },
  { name: "Sync Status", href: "/admin/sync-status", icon: Activity, requiredRoles: ["super_admin", "admin"] },
  { name: "User Management", href: "/admin/users", icon: UserCog, requiredRoles: ["super_admin", "admin"] },
  { name: "Billing", href: "/admin/billing", icon: CreditCard, requiredRoles: ["super_admin", "admin"] },
  { name: "Tenant Management", href: "/admin/tenants", icon: Building2, requiredRoles: ["super_admin"] },
  { name: "Settings", href: "/admin/settings", icon: Settings, requiredRoles: ["super_admin", "admin"] },
  { name: "Super Admin", href: "/admin/super", icon: Shield, requiredRoles: ["super_admin"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, currentTenant, signOut } = useAuth();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/login";
  };

  // Check both global role (from profile) and tenant-specific role
  const globalRole = profile?.role;
  const tenantRole = currentTenant?.role;

  const canAccess = (item: NavItem) => {
    if (!item.requiredRoles) return true;
    // Check if either the global role or tenant role grants access
    if (globalRole && item.requiredRoles.includes(globalRole)) return true;
    if (tenantRole && item.requiredRoles.includes(tenantRole)) return true;
    return false;
  };

  const visibleAdminItems = adminNavigation.filter(canAccess);

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive =
      pathname === item.href ||
      (item.href !== "/" && pathname.startsWith(item.href));

    return (
      <Link
        key={item.name}
        href={item.href}
        onMouseEnter={() => setHoveredItem(item.name)}
        onMouseLeave={() => setHoveredItem(null)}
        className={`relative flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group ${
          isActive
            ? "bg-gradient-to-r from-teal-500/20 via-cyan-500/15 to-teal-500/10 text-white shadow-lg shadow-teal-500/10"
            : "text-slate-400 hover:text-white hover:bg-white/5"
        }`}
      >
        {/* Active indicator bar */}
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-teal-400 to-cyan-400 rounded-r-full shadow-lg shadow-teal-400/50" />
        )}

        <div className={`relative ${isActive ? "text-teal-400" : "group-hover:text-teal-400"} transition-colors`}>
          <item.icon className="h-5 w-5" />
          {isActive && (
            <div className="absolute inset-0 blur-md bg-teal-400/50" />
          )}
        </div>

        <span className="flex-1">{item.name}</span>

        {item.badge && (
          <span className="px-2 py-0.5 text-xs font-bold bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full">
            {item.badge}
          </span>
        )}

        {(isActive || hoveredItem === item.name) && (
          <ChevronRight className={`h-4 w-4 transition-all duration-200 ${isActive ? "opacity-100" : "opacity-50"}`} />
        )}
      </Link>
    );
  };

  const getRoleBadge = () => {
    const role = tenantRole || globalRole || "user";
    switch (role) {
      case "super_admin":
        return (
          <span className="px-2 py-0.5 text-xs font-bold bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-full flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            Super Admin
          </span>
        );
      case "admin":
        return (
          <span className="px-2 py-0.5 text-xs font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-full">
            Admin
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-xs font-medium bg-slate-700 text-slate-300 rounded-full capitalize">
            {role}
          </span>
        );
    }
  };

  return (
    <aside className="w-72 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex flex-col relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-gradient-to-br from-teal-500/10 to-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-violet-500/10 to-purple-500/5 rounded-full blur-3xl" />
      </div>

      {/* Logo */}
      <div className="relative p-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-400 via-cyan-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-xl shadow-teal-500/30 transform transition-transform hover:scale-105">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-2xl blur-xl opacity-40" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              3CX BackupWiz
            </h1>
            <p className="text-xs text-slate-500 font-medium">Enterprise Edition</p>
          </div>
        </div>
      </div>

      <nav className="relative flex-1 px-3 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {/* Main Navigation */}
        <div className="mb-6">
          <div className="flex items-center gap-2 px-4 mb-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Main Menu</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
          </div>
          {navigation.map((item) => (
            <NavLink key={item.name} item={item} />
          ))}
        </div>

        {/* Communications Navigation */}
        <div className="mb-6">
          <div className="flex items-center gap-2 px-4 mb-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Communications</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
          </div>
          {communicationsNavigation.map((item) => (
            <NavLink key={item.name} item={item} />
          ))}
        </div>

        {/* Admin Navigation */}
        {visibleAdminItems.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 px-4 mb-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Administration</span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
            </div>
            {visibleAdminItems.map((item) => (
              <NavLink key={item.name} item={item} />
            ))}
          </div>
        )}
      </nav>

      {/* User Profile Section */}
      <div className="relative p-4 border-t border-slate-800/50 bg-gradient-to-t from-slate-950/50 to-transparent">
        {/* Profile Card */}
        <Link
          href="/profile"
          className="group flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-slate-800/80 to-slate-800/40 border border-slate-700/50 hover:border-slate-600/50 hover:bg-slate-800/60 transition-all duration-300 mb-3"
        >
          {/* Avatar */}
          <div className="relative">
            <div className="w-11 h-11 rounded-xl overflow-hidden ring-2 ring-slate-700/50 group-hover:ring-teal-500/30 transition-all">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">
                    {profile?.full_name?.charAt(0) || profile?.email?.charAt(0).toUpperCase() || "U"}
                  </span>
                </div>
              )}
            </div>
            {/* Online indicator */}
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-slate-900 shadow-lg shadow-emerald-500/50" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate group-hover:text-teal-400 transition-colors">
              {profile?.full_name || profile?.email?.split("@")[0] || "User"}
            </p>
            <div className="mt-1">
              {getRoleBadge()}
            </div>
          </div>

          <User className="h-4 w-4 text-slate-500 group-hover:text-teal-400 transition-colors" />
        </Link>

        {/* Sign Out Button */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white bg-slate-800/30 hover:bg-red-500/20 border border-slate-700/30 hover:border-red-500/30 rounded-xl transition-all duration-300"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>

        {/* Sync Status */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 mt-4">
          <div className="relative">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <div className="absolute inset-0 h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          </div>
          <span className="font-medium">Sync Active</span>
        </div>
      </div>
    </aside>
  );
}
