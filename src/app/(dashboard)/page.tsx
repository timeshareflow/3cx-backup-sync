import { StatsOverview } from "@/components/admin/StatsOverview";
import { SyncStatusCard } from "@/components/admin/SyncStatusCard";
import { StorageMonitor } from "@/components/storage/StorageMonitor";
import Link from "next/link";
import { MessageSquare, Search, Users, Settings, LayoutDashboard } from "lucide-react";

export default function Home() {
  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Storage Warning Banner */}
      <StorageMonitor variant="banner" />

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl shadow-lg shadow-teal-500/25">
          <LayoutDashboard className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500 mt-1">3CX BackupWiz - For self-hosted & on-prem systems</p>
        </div>
      </div>

      <StatsOverview />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SyncStatusCard />
        <StorageMonitor variant="full" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4">
            <Link
              href="/conversations"
              className="group flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-teal-50 to-cyan-50 border-2 border-teal-200 hover:border-teal-300 hover:shadow-md transition-all"
            >
              <div className="p-2 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg shadow-md group-hover:shadow-lg transition-shadow">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <span className="font-semibold text-slate-700">Conversations</span>
            </Link>
            <Link
              href="/search"
              className="group flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-200 hover:border-emerald-300 hover:shadow-md transition-all"
            >
              <div className="p-2 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg shadow-md group-hover:shadow-lg transition-shadow">
                <Search className="h-5 w-5 text-white" />
              </div>
              <span className="font-semibold text-slate-700">Search</span>
            </Link>
            <Link
              href="/extensions"
              className="group flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 hover:border-blue-300 hover:shadow-md transition-all"
            >
              <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-md group-hover:shadow-lg transition-shadow">
                <Users className="h-5 w-5 text-white" />
              </div>
              <span className="font-semibold text-slate-700">Extensions</span>
            </Link>
            <Link
              href="/admin/settings"
              className="group flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-gray-100 border-2 border-slate-200 hover:border-slate-300 hover:shadow-md transition-all"
            >
              <div className="p-2 bg-gradient-to-br from-slate-600 to-gray-700 rounded-lg shadow-md group-hover:shadow-lg transition-shadow">
                <Settings className="h-5 w-5 text-white" />
              </div>
              <span className="font-semibold text-slate-700">Settings</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
