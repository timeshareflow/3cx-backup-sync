import { StatsOverview } from "@/components/admin/StatsOverview";
import { SyncStatusCard } from "@/components/admin/SyncStatusCard";
import { StorageMonitor } from "@/components/storage/StorageMonitor";
import Link from "next/link";
import {
  MessageSquare,
  Search,
  Users,
  Settings,
  LayoutDashboard,
  ArrowRight,
  Sparkles,
  Shield,
  Zap,
  Clock,
} from "lucide-react";

export default function Home() {
  return (
    <div className="space-y-8 p-8 max-w-7xl mx-auto">
      {/* Storage Warning Banner */}
      <StorageMonitor variant="banner" />

      {/* Header with gradient background */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 shadow-2xl">
        {/* Background decorations */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-gradient-to-br from-teal-500/20 to-cyan-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-gradient-to-tr from-violet-500/20 to-purple-500/10 rounded-full blur-3xl" />
          <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        </div>

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="p-4 bg-gradient-to-br from-teal-400 via-cyan-500 to-teal-600 rounded-2xl shadow-xl shadow-teal-500/30">
                <LayoutDashboard className="h-10 w-10 text-white" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-2xl blur-xl opacity-50" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-bold text-white">Dashboard</h1>
                <span className="px-3 py-1 bg-gradient-to-r from-teal-500/20 to-cyan-500/20 border border-teal-500/30 text-teal-400 text-xs font-bold rounded-full flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Enterprise
                </span>
              </div>
              <p className="text-slate-400 text-lg">
                3CX BackupWiz - Professional backup for self-hosted & on-prem systems
              </p>
            </div>
          </div>

          {/* Quick stats */}
          <div className="hidden lg:flex items-center gap-4">
            <div className="flex items-center gap-3 px-5 py-3 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10">
              <div className="p-2 bg-emerald-500/20 rounded-lg">
                <Zap className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Status</p>
                <p className="text-sm font-bold text-emerald-400">All Systems Go</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-3 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10">
              <div className="p-2 bg-teal-500/20 rounded-lg">
                <Clock className="h-5 w-5 text-teal-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Sync</p>
                <p className="text-sm font-bold text-white">Real-time</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <StatsOverview />

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SyncStatusCard />
        <StorageMonitor variant="full" />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 p-8 overflow-hidden relative">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-full -mr-32 -mt-32 opacity-50" />

        <div className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg shadow-violet-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Quick Actions</h2>
              <p className="text-sm text-slate-500">Jump to common tasks</p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              href="/conversations"
              className="group relative overflow-hidden flex flex-col items-start gap-4 p-6 rounded-2xl bg-gradient-to-br from-teal-50 via-white to-cyan-50 border-2 border-teal-100 hover:border-teal-300 hover:shadow-xl hover:shadow-teal-100/50 transition-all duration-300"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-teal-100 to-cyan-100 rounded-full -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-lg shadow-teal-500/25 group-hover:scale-110 group-hover:shadow-teal-500/40 transition-all duration-300">
                <MessageSquare className="h-6 w-6 text-white" />
              </div>
              <div className="relative">
                <span className="font-bold text-slate-800 group-hover:text-teal-700 transition-colors">Conversations</span>
                <p className="text-sm text-slate-500 mt-1">Browse chat history</p>
              </div>
              <ArrowRight className="absolute bottom-6 right-6 h-5 w-5 text-slate-300 group-hover:text-teal-500 group-hover:translate-x-1 transition-all" />
            </Link>

            <Link
              href="/search"
              className="group relative overflow-hidden flex flex-col items-start gap-4 p-6 rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-green-50 border-2 border-emerald-100 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-100/50 transition-all duration-300"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-100 to-green-100 rounded-full -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-3 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl shadow-lg shadow-emerald-500/25 group-hover:scale-110 group-hover:shadow-emerald-500/40 transition-all duration-300">
                <Search className="h-6 w-6 text-white" />
              </div>
              <div className="relative">
                <span className="font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">Search</span>
                <p className="text-sm text-slate-500 mt-1">Find any message</p>
              </div>
              <ArrowRight className="absolute bottom-6 right-6 h-5 w-5 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
            </Link>

            <Link
              href="/extensions"
              className="group relative overflow-hidden flex flex-col items-start gap-4 p-6 rounded-2xl bg-gradient-to-br from-blue-50 via-white to-indigo-50 border-2 border-blue-100 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-100/50 transition-all duration-300"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/25 group-hover:scale-110 group-hover:shadow-blue-500/40 transition-all duration-300">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div className="relative">
                <span className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">Extensions</span>
                <p className="text-sm text-slate-500 mt-1">Manage users</p>
              </div>
              <ArrowRight className="absolute bottom-6 right-6 h-5 w-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
            </Link>

            <Link
              href="/admin/settings"
              className="group relative overflow-hidden flex flex-col items-start gap-4 p-6 rounded-2xl bg-gradient-to-br from-slate-50 via-white to-gray-50 border-2 border-slate-200 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-100/50 transition-all duration-300"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-slate-100 to-gray-100 rounded-full -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-3 bg-gradient-to-br from-slate-600 to-gray-700 rounded-xl shadow-lg shadow-slate-500/25 group-hover:scale-110 group-hover:shadow-slate-500/40 transition-all duration-300">
                <Settings className="h-6 w-6 text-white" />
              </div>
              <div className="relative">
                <span className="font-bold text-slate-800 group-hover:text-slate-600 transition-colors">Settings</span>
                <p className="text-sm text-slate-500 mt-1">Configure app</p>
              </div>
              <ArrowRight className="absolute bottom-6 right-6 h-5 w-5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-1 transition-all" />
            </Link>
          </div>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="group p-6 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-xl shadow-teal-500/25 hover:shadow-2xl hover:shadow-teal-500/30 transition-all duration-300 hover:-translate-y-1">
          <div className="p-3 bg-white/20 rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Secure Backups</h3>
          <p className="text-teal-100 text-sm">
            Your data is encrypted and stored securely with enterprise-grade protection.
          </p>
        </div>

        <div className="group p-6 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-xl shadow-violet-500/25 hover:shadow-2xl hover:shadow-violet-500/30 transition-all duration-300 hover:-translate-y-1">
          <div className="p-3 bg-white/20 rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Real-time Sync</h3>
          <p className="text-violet-100 text-sm">
            Automatic synchronization keeps your backup always up-to-date.
          </p>
        </div>

        <div className="group p-6 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-xl shadow-amber-500/25 hover:shadow-2xl hover:shadow-amber-500/30 transition-all duration-300 hover:-translate-y-1">
          <div className="p-3 bg-white/20 rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Smart Search</h3>
          <p className="text-amber-100 text-sm">
            Find any message, file, or recording instantly with powerful search.
          </p>
        </div>
      </div>
    </div>
  );
}
