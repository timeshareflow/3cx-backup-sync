"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  requiredRoles?: string[];
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Conversations", href: "/conversations", icon: MessageSquare },
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
  const { profile, signOut } = useAuth();

  const userRole = profile?.role;

  const canAccess = (item: NavItem) => {
    if (!item.requiredRoles) return true;
    if (!userRole) return false;
    return item.requiredRoles.includes(userRole);
  };

  const visibleAdminItems = adminNavigation.filter(canAccess);

  return (
    <aside className="w-72 bg-slate-900 flex flex-col">
      {/* Logo */}
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">3CX BackupWiz</h1>
            <p className="text-xs text-slate-400">Self-hosted & On-prem</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {/* Main Navigation */}
        <div className="mb-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-3">
            Main Menu
          </div>
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-gradient-to-r from-teal-500/20 to-cyan-500/20 text-teal-400 border border-teal-500/30"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <item.icon className={`h-5 w-5 ${isActive ? "text-teal-400" : ""}`} />
                {item.name}
              </Link>
            );
          })}
        </div>

        {/* Communications Navigation */}
        <div className="pt-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-3">
            Communications
          </div>
          {communicationsNavigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-gradient-to-r from-teal-500/20 to-cyan-500/20 text-teal-400 border border-teal-500/30"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <item.icon className={`h-5 w-5 ${isActive ? "text-teal-400" : ""}`} />
                {item.name}
              </Link>
            );
          })}
        </div>

        {/* Admin Navigation */}
        {visibleAdminItems.length > 0 && (
          <div className="pt-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-3">
              Administration
            </div>
            {visibleAdminItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-gradient-to-r from-teal-500/20 to-cyan-500/20 text-teal-400 border border-teal-500/30"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <item.icon className={`h-5 w-5 ${isActive ? "text-teal-400" : ""}`} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* User Info & Logout */}
      <div className="p-4 border-t border-slate-700/50">
        <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-lg flex items-center justify-center text-white font-semibold text-sm">
              {profile?.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div>
              <p className="text-sm font-medium text-white truncate max-w-[120px]">
                {profile?.full_name || profile?.email?.split("@")[0] || "User"}
              </p>
              <p className="text-xs text-slate-400 capitalize">{profile?.role || "User"}</p>
            </div>
          </div>
        </div>

        <button
          onClick={signOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>

        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 mt-4">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span>Sync Active</span>
        </div>
      </div>
    </aside>
  );
}
