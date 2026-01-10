"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  Shield,
  Users,
  Building2,
  Database,
  Activity,
  AlertTriangle,
  Clock,
  HardDrive,
  ArrowUpRight,
  MessageSquare,
  Settings,
} from "lucide-react";

interface SystemStats {
  totalTenants: number;
  totalUsers: number;
  totalConversations: number;
  totalMessages: number;
  totalMediaFiles: number;
  storageUsedMB: number;
  lastSyncTime: string | null;
  syncStatus: "running" | "idle" | "error";
}

export default function SuperAdminPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && profile?.role !== "super_admin") {
      router.push("/unauthorized");
      return;
    }

    if (profile?.role === "super_admin") {
      fetchStats();
    }
  }, [profile, authLoading, router]);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/admin/system-stats");
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch system stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (profile?.role !== "super_admin") {
    return null;
  }

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl shadow-lg shadow-teal-500/25">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Super Admin Dashboard</h1>
            <p className="text-gray-500 mt-1">System-wide settings and monitoring</p>
          </div>
        </div>
        <Button onClick={() => router.push("/admin/settings")}>
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-teal-500/10 to-transparent rounded-full -mr-16 -mt-16" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Tenants</p>
                <p className="text-3xl font-bold text-gray-900">{stats?.totalTenants || 0}</p>
              </div>
              <div className="p-3 bg-teal-100 rounded-xl">
                <Building2 className="h-6 w-6 text-teal-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm text-teal-600">
              <ArrowUpRight className="h-4 w-4 mr-1" />
              Active organizations
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent rounded-full -mr-16 -mt-16" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Users</p>
                <p className="text-3xl font-bold text-gray-900">{stats?.totalUsers || 0}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-xl">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm text-blue-600">
              <ArrowUpRight className="h-4 w-4 mr-1" />
              Registered users
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-full -mr-16 -mt-16" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Messages</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats?.totalMessages?.toLocaleString() || 0}
                </p>
              </div>
              <div className="p-3 bg-emerald-100 rounded-xl">
                <MessageSquare className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm text-emerald-600">
              <ArrowUpRight className="h-4 w-4 mr-1" />
              Total archived
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/10 to-transparent rounded-full -mr-16 -mt-16" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Storage</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats?.storageUsedMB?.toFixed(1) || 0} <span className="text-lg font-medium text-gray-500">MB</span>
                </p>
              </div>
              <div className="p-3 bg-amber-100 rounded-xl">
                <HardDrive className="h-6 w-6 text-amber-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm text-amber-600">
              <ArrowUpRight className="h-4 w-4 mr-1" />
              Total used
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-teal-100 rounded-lg">
                <Activity className="h-5 w-5 text-teal-600" />
              </div>
              Sync Service Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <span className="text-gray-600 font-medium">Status</span>
                <span className={`flex items-center gap-2 font-semibold px-3 py-1 rounded-full text-sm ${
                  stats?.syncStatus === "running"
                    ? "text-emerald-700 bg-emerald-100"
                    : stats?.syncStatus === "error"
                    ? "text-red-700 bg-red-100"
                    : "text-gray-700 bg-gray-200"
                }`}>
                  <span className={`h-2 w-2 rounded-full ${
                    stats?.syncStatus === "running" ? "bg-emerald-500 animate-pulse" :
                    stats?.syncStatus === "error" ? "bg-red-500" : "bg-gray-400"
                  }`} />
                  {stats?.syncStatus === "running" ? "Running" : stats?.syncStatus === "error" ? "Error" : "Idle"}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <span className="text-gray-600 font-medium">Last Sync</span>
                <span className="font-semibold flex items-center gap-2 text-gray-900">
                  <Clock className="h-4 w-4 text-gray-400" />
                  {stats?.lastSyncTime || "Never"}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <span className="text-gray-600 font-medium">Media Files</span>
                <span className="font-semibold text-gray-900">{stats?.totalMediaFiles || 0}</span>
              </div>
              <Button variant="outline" className="w-full">
                View Sync Logs
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              System Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats?.syncStatus === "error" ? (
                <div className="flex items-start gap-4 p-4 bg-red-50 border border-red-100 rounded-xl">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-red-800">Sync Error</p>
                    <p className="text-sm text-red-600 mt-1">
                      The sync service encountered an error. Check logs for details.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <div className="p-4 bg-emerald-100 rounded-full mb-4">
                    <Shield className="h-8 w-8 text-emerald-600" />
                  </div>
                  <p className="font-semibold text-gray-900">No active alerts</p>
                  <p className="text-sm text-gray-500 mt-1">System is running normally</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => router.push("/admin/tenants")}
              className="group p-6 bg-gradient-to-br from-teal-50 to-cyan-50 hover:from-teal-100 hover:to-cyan-100 border-2 border-teal-200 hover:border-teal-300 rounded-2xl transition-all duration-200 flex flex-col items-center gap-3"
            >
              <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-lg shadow-teal-500/25 group-hover:shadow-teal-500/40 transition-shadow">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <span className="font-semibold text-gray-900">Manage Tenants</span>
              <span className="text-sm text-gray-500">Add, edit, or remove tenants</span>
            </button>

            <button
              onClick={() => router.push("/admin/users")}
              className="group p-6 bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-2 border-blue-200 hover:border-blue-300 rounded-2xl transition-all duration-200 flex flex-col items-center gap-3"
            >
              <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/25 group-hover:shadow-blue-500/40 transition-shadow">
                <Users className="h-6 w-6 text-white" />
              </div>
              <span className="font-semibold text-gray-900">Manage Users</span>
              <span className="text-sm text-gray-500">User accounts and roles</span>
            </button>

            <button
              onClick={() => router.push("/admin/settings")}
              className="group p-6 bg-gradient-to-br from-emerald-50 to-green-50 hover:from-emerald-100 hover:to-green-100 border-2 border-emerald-200 hover:border-emerald-300 rounded-2xl transition-all duration-200 flex flex-col items-center gap-3"
            >
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl shadow-lg shadow-emerald-500/25 group-hover:shadow-emerald-500/40 transition-shadow">
                <Database className="h-6 w-6 text-white" />
              </div>
              <span className="font-semibold text-gray-900">System Settings</span>
              <span className="text-sm text-gray-500">Configure app settings</span>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
