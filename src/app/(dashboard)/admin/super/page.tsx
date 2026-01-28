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
  CreditCard,
  Package,
  Plus,
  Edit,
  Trash2,
  Check,
  X,
  Mail,
  Phone,
  Bell,
  Send,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { EmailSettingsSection } from "@/components/admin/EmailSettingsSection";

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

interface StoragePlan {
  id: string;
  name: string;
  description: string | null;
  storage_limit_gb: number;
  price_monthly: string;
  price_yearly: string | null;
  currency: string;
  features: string[];
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  overage_price_per_gb: string | null;
  allow_overage: boolean;
}

interface SmtpSettings {
  id?: string;
  host: string;
  port: number;
  username: string;
  password_encrypted?: string;
  from_email: string;
  from_name: string;
  encryption: "none" | "ssl" | "tls";
  is_active: boolean;
  has_password?: boolean;
}

interface SmsSettings {
  id?: string;
  provider: string;
  api_key_encrypted?: string;
  api_secret_encrypted?: string;
  from_number: string;
  webhook_url?: string;
  is_active: boolean;
  has_api_key?: boolean;
  has_api_secret?: boolean;
}

interface PushSettings {
  id?: string;
  provider: string;
  firebase_project_id?: string;
  firebase_private_key_encrypted?: string;
  firebase_client_email?: string;
  apns_key_id?: string;
  apns_team_id?: string;
  apns_private_key_encrypted?: string;
  is_active: boolean;
  has_firebase_key?: boolean;
  has_apns_key?: boolean;
}

export default function SuperAdminPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [storagePlans, setStoragePlans] = useState<StoragePlan[]>([]);
  const [editingPlan, setEditingPlan] = useState<StoragePlan | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);

  // Notification settings state
  const [smtpSettings, setSmtpSettings] = useState<SmtpSettings | null>(null);
  const [smsSettings, setSmsSettings] = useState<SmsSettings | null>(null);
  const [pushSettings, setPushSettings] = useState<PushSettings | null>(null);
  const [editingSmtp, setEditingSmtp] = useState(false);
  const [editingSms, setEditingSms] = useState(false);
  const [editingPush, setEditingPush] = useState(false);
  const [notifSaving, setNotifSaving] = useState<string | null>(null);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ channel: string; success: boolean; message: string } | null>(null);

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return;

    // If profile is still null after auth loading, wait for it
    if (!profile) return;

    if (profile.role !== "super_admin") {
      router.push("/unauthorized");
      return;
    }

    fetchStats();
    fetchStoragePlans();
    fetchNotificationSettings();
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

  const fetchStoragePlans = async () => {
    try {
      const response = await fetch("/api/admin/storage-plans");
      if (response.ok) {
        const data = await response.json();
        setStoragePlans(data.plans || []);
      }
    } catch (error) {
      console.error("Failed to fetch storage plans:", error);
    }
  };

  const savePlan = async (plan: Partial<StoragePlan>) => {
    setPlanSaving(true);
    try {
      const method = plan.id ? "PUT" : "POST";
      const response = await fetch("/api/admin/storage-plans", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });

      if (response.ok) {
        await fetchStoragePlans();
        setEditingPlan(null);
        setIsCreating(false);
      }
    } catch (error) {
      console.error("Failed to save plan:", error);
    } finally {
      setPlanSaving(false);
    }
  };

  const deletePlan = async (id: string) => {
    if (!confirm("Are you sure you want to delete this plan?")) return;

    try {
      const response = await fetch(`/api/admin/storage-plans?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await fetchStoragePlans();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete plan");
      }
    } catch (error) {
      console.error("Failed to delete plan:", error);
    }
  };

  const fetchNotificationSettings = async () => {
    try {
      const [smtpRes, smsRes, pushRes] = await Promise.all([
        fetch("/api/admin/smtp"),
        fetch("/api/admin/sms"),
        fetch("/api/admin/push"),
      ]);

      if (smtpRes.ok) {
        const data = await smtpRes.json();
        setSmtpSettings(data.settings);
      }
      if (smsRes.ok) {
        const data = await smsRes.json();
        setSmsSettings(data.settings);
      }
      if (pushRes.ok) {
        const data = await pushRes.json();
        setPushSettings(data.settings);
      }
    } catch (error) {
      console.error("Failed to fetch notification settings:", error);
    }
  };

  const saveSmtpSettings = async (data: Partial<SmtpSettings>) => {
    setNotifSaving("smtp");
    try {
      const method = smtpSettings?.id ? "PUT" : "POST";
      const response = await fetch("/api/admin/smtp", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, id: smtpSettings?.id }),
      });

      if (response.ok) {
        await fetchNotificationSettings();
        setEditingSmtp(false);
      } else {
        const result = await response.json();
        alert(result.error || "Failed to save SMTP settings");
      }
    } catch (error) {
      console.error("Failed to save SMTP settings:", error);
    } finally {
      setNotifSaving(null);
    }
  };

  const saveSmsSettings = async (data: Partial<SmsSettings>) => {
    setNotifSaving("sms");
    try {
      const method = smsSettings?.id ? "PUT" : "POST";
      const response = await fetch("/api/admin/sms", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, id: smsSettings?.id }),
      });

      if (response.ok) {
        await fetchNotificationSettings();
        setEditingSms(false);
      } else {
        const result = await response.json();
        alert(result.error || "Failed to save SMS settings");
      }
    } catch (error) {
      console.error("Failed to save SMS settings:", error);
    } finally {
      setNotifSaving(null);
    }
  };

  const savePushSettings = async (data: Partial<PushSettings>) => {
    setNotifSaving("push");
    try {
      const method = pushSettings?.id ? "PUT" : "POST";
      const response = await fetch("/api/admin/push", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, id: pushSettings?.id }),
      });

      if (response.ok) {
        await fetchNotificationSettings();
        setEditingPush(false);
      } else {
        const result = await response.json();
        alert(result.error || "Failed to save push settings");
      }
    } catch (error) {
      console.error("Failed to save push settings:", error);
    } finally {
      setNotifSaving(null);
    }
  };

  const testNotificationChannel = async (channel: "email" | "sms" | "push", recipient?: string) => {
    setTestingChannel(channel);
    setTestResult(null);
    try {
      const response = await fetch("/api/admin/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, recipient }),
      });

      const data = await response.json();
      setTestResult({
        channel,
        success: data.success,
        message: data.success ? (data.message || "Connection successful!") : (data.error || "Test failed"),
      });
    } catch (error) {
      setTestResult({
        channel,
        success: false,
        message: "Failed to test connection",
      });
    } finally {
      setTestingChannel(null);
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

      {/* Storage Plans Management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-lg">
              <Package className="h-5 w-5 text-violet-600" />
            </div>
            Storage Plans
          </CardTitle>
          <Button onClick={() => setIsCreating(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Plan
          </Button>
        </CardHeader>
        <CardContent>
          {(isCreating || editingPlan) && (
            <PlanEditor
              plan={editingPlan || undefined}
              onSave={savePlan}
              onCancel={() => {
                setEditingPlan(null);
                setIsCreating(false);
              }}
              isSaving={planSaving}
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {storagePlans.map((plan) => (
              <div
                key={plan.id}
                className={`relative p-6 rounded-2xl border-2 ${
                  plan.is_default
                    ? "border-violet-300 bg-gradient-to-br from-violet-50 to-purple-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                {plan.is_default && (
                  <div className="absolute -top-3 left-4 px-3 py-1 bg-violet-500 text-white text-xs font-medium rounded-full">
                    Default
                  </div>
                )}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingPlan(plan)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deletePlan(plan.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mb-4">
                  <span className="text-3xl font-bold text-gray-900">
                    ${parseFloat(plan.price_monthly).toFixed(0)}
                  </span>
                  <span className="text-gray-500">/month</span>
                </div>
                <div className="flex items-center gap-2 mb-2 text-sm text-gray-600">
                  <HardDrive className="h-4 w-4" />
                  {plan.storage_limit_gb === 0 ? "Unlimited" : `${plan.storage_limit_gb} GB`} Storage
                </div>
                {plan.allow_overage && plan.overage_price_per_gb && (
                  <div className="text-xs text-gray-500 mb-4">
                    +${parseFloat(plan.overage_price_per_gb).toFixed(2)}/GB overage
                  </div>
                )}
                {!plan.allow_overage && (
                  <div className="text-xs text-red-500 mb-4">
                    Hard limit (no overage)
                  </div>
                )}
                <ul className="space-y-2 text-sm">
                  {(plan.features || []).slice(0, 4).map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-600">
                      <Check className="h-4 w-4 text-emerald-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                {plan.stripe_price_id_monthly && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <CreditCard className="h-3 w-3" />
                      Stripe Connected
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {storagePlans.length === 0 && !isCreating && (
            <div className="text-center py-12 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="font-medium">No storage plans configured</p>
              <p className="text-sm mt-1">Click Add Plan to create your first plan</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Settings - SendGrid / SMTP with Category Addresses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg">
              <Mail className="h-5 w-5 text-white" />
            </div>
            Email Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmailSettingsSection />
        </CardContent>
      </Card>

      {/* Other Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Bell className="h-5 w-5 text-blue-600" />
            </div>
            Other Notification Channels
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Test Result Alert */}
            {testResult && (
              <div className={`flex items-center gap-3 p-4 rounded-xl ${
                testResult.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
              }`}>
                {testResult.success ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
                <span className="font-medium">{testResult.channel.toUpperCase()}: {testResult.message}</span>
                <button
                  onClick={() => setTestResult(null)}
                  className="ml-auto p-1 hover:bg-black/10 rounded"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* SMS Settings */}
            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Phone className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">SMS (Wiretap Telecom)</h4>
                    <p className="text-sm text-gray-500">
                      {smsSettings?.is_active ? "Configured" : "Not configured"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testNotificationChannel("sms")}
                    disabled={!smsSettings?.id || testingChannel === "sms"}
                  >
                    {testingChannel === "sms" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    <span className="ml-2">Test</span>
                  </Button>
                  <Button size="sm" onClick={() => setEditingSms(!editingSms)}>
                    {editingSms ? "Cancel" : smsSettings?.id ? "Edit" : "Configure"}
                  </Button>
                </div>
              </div>

              {editingSms && (
                <SmsEditor
                  settings={smsSettings}
                  onSave={saveSmsSettings}
                  onCancel={() => setEditingSms(false)}
                  isSaving={notifSaving === "sms"}
                />
              )}

              {!editingSms && smsSettings?.id && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Provider:</span>
                    <span className="ml-2 font-medium capitalize">{smsSettings.provider}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">From Number:</span>
                    <span className="ml-2 font-medium">{smsSettings.from_number || "Not set"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">API Key:</span>
                    <span className="ml-2 font-medium">{smsSettings.has_api_key ? "Set" : "Not set"}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Push Notification Settings */}
            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <Bell className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Push Notifications (Firebase)</h4>
                    <p className="text-sm text-gray-500">
                      {pushSettings?.is_active ? "Configured" : "Not configured"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testNotificationChannel("push")}
                    disabled={!pushSettings?.id || testingChannel === "push"}
                  >
                    {testingChannel === "push" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    <span className="ml-2">Test</span>
                  </Button>
                  <Button size="sm" onClick={() => setEditingPush(!editingPush)}>
                    {editingPush ? "Cancel" : pushSettings?.id ? "Edit" : "Configure"}
                  </Button>
                </div>
              </div>

              {editingPush && (
                <PushEditor
                  settings={pushSettings}
                  onSave={savePushSettings}
                  onCancel={() => setEditingPush(false)}
                  isSaving={notifSaving === "push"}
                />
              )}

              {!editingPush && pushSettings?.id && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Provider:</span>
                    <span className="ml-2 font-medium capitalize">{pushSettings.provider}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Project ID:</span>
                    <span className="ml-2 font-medium">{pushSettings.firebase_project_id || "Not set"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Private Key:</span>
                    <span className="ml-2 font-medium">{pushSettings.has_firebase_key ? "Set" : "Not set"}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PlanEditor({
  plan,
  onSave,
  onCancel,
  isSaving,
}: {
  plan?: StoragePlan;
  onSave: (plan: Partial<StoragePlan>) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState({
    id: plan?.id || "",
    name: plan?.name || "",
    description: plan?.description || "",
    storage_limit_gb: plan?.storage_limit_gb?.toString() || "10",
    price_monthly: plan?.price_monthly || "0",
    price_yearly: plan?.price_yearly || "",
    currency: plan?.currency || "USD",
    features: (plan?.features || []).join("\n"),
    is_active: plan?.is_active ?? true,
    is_default: plan?.is_default ?? false,
    sort_order: plan?.sort_order?.toString() || "0",
    stripe_price_id_monthly: plan?.stripe_price_id_monthly || "",
    stripe_price_id_yearly: plan?.stripe_price_id_yearly || "",
    overage_price_per_gb: plan?.overage_price_per_gb || "0.15",
    allow_overage: plan?.allow_overage ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      id: formData.id || undefined,
      storage_limit_gb: parseInt(formData.storage_limit_gb),
      sort_order: parseInt(formData.sort_order),
      features: formData.features.split("\n").filter((f) => f.trim()),
      overage_price_per_gb: parseFloat(formData.overage_price_per_gb),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 bg-gray-50 rounded-2xl border border-gray-200 mb-6">
      <h4 className="text-lg font-semibold mb-4">{plan ? "Edit Plan" : "Create New Plan"}</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Plan Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Storage Limit (GB, 0=unlimited)</label>
          <input
            type="number"
            value={formData.storage_limit_gb}
            onChange={(e) => setFormData({ ...formData, storage_limit_gb: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            min="0"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Price</label>
          <input
            type="number"
            step="0.01"
            value={formData.price_monthly}
            onChange={(e) => setFormData({ ...formData, price_monthly: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            min="0"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Yearly Price (optional)</label>
          <input
            type="number"
            step="0.01"
            value={formData.price_yearly}
            onChange={(e) => setFormData({ ...formData, price_yearly: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            min="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Overage Price ($/GB)</label>
          <input
            type="number"
            step="0.01"
            value={formData.overage_price_per_gb}
            onChange={(e) => setFormData({ ...formData, overage_price_per_gb: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            min="0"
            placeholder="0.15"
          />
        </div>
        <div className="flex items-center">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.allow_overage}
              onChange={(e) => setFormData({ ...formData, allow_overage: e.target.checked })}
              className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-sm text-gray-700">Allow overage (charge for extra storage)</span>
          </label>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Features (one per line)</label>
          <textarea
            value={formData.features}
            onChange={(e) => setFormData({ ...formData, features: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            rows={4}
            placeholder="5 GB Storage&#10;Up to 10 users&#10;Email support"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Stripe Monthly Price ID</label>
          <input
            type="text"
            value={formData.stripe_price_id_monthly}
            onChange={(e) => setFormData({ ...formData, stripe_price_id_monthly: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            placeholder="price_..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Stripe Yearly Price ID</label>
          <input
            type="text"
            value={formData.stripe_price_id_yearly}
            onChange={(e) => setFormData({ ...formData, stripe_price_id_yearly: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            placeholder="price_..."
          />
        </div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-sm text-gray-700">Active</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_default}
              onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
              className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-sm text-gray-700">Default Plan</span>
          </label>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-6">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : plan ? "Update Plan" : "Create Plan"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SmtpEditor({
  settings,
  onSave,
  onCancel,
  isSaving,
}: {
  settings: SmtpSettings | null;
  onSave: (data: Partial<SmtpSettings>) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState({
    host: settings?.host || "",
    port: settings?.port?.toString() || "587",
    username: settings?.username || "",
    password: "",
    from_email: settings?.from_email || "",
    from_name: settings?.from_name || "3CX BackupWiz",
    encryption: settings?.encryption || "tls",
    is_active: settings?.is_active ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      port: parseInt(formData.port),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 p-4 bg-white rounded-xl border border-gray-200">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
          <input
            type="text"
            value={formData.host}
            onChange={(e) => setFormData({ ...formData, host: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500"
            placeholder="smtp.example.com"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
          <input
            type="number"
            value={formData.port}
            onChange={(e) => setFormData({ ...formData, port: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password {settings?.has_password && <span className="text-gray-400">(leave blank to keep)</span>}
          </label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500"
            placeholder={settings?.has_password ? "********" : ""}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
          <input
            type="email"
            value={formData.from_email}
            onChange={(e) => setFormData({ ...formData, from_email: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500"
            placeholder="noreply@example.com"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
          <input
            type="text"
            value={formData.from_name}
            onChange={(e) => setFormData({ ...formData, from_name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Encryption</label>
          <select
            value={formData.encryption}
            onChange={(e) => setFormData({ ...formData, encryption: e.target.value as "none" | "ssl" | "tls" })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500"
          >
            <option value="none">None</option>
            <option value="ssl">SSL</option>
            <option value="tls">TLS (STARTTLS)</option>
          </select>
        </div>
        <div className="flex items-center">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-sm text-gray-700">Active</span>
          </label>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <Button type="submit" disabled={isSaving} size="sm">
          {isSaving ? "Saving..." : "Save SMTP Settings"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} size="sm">
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SmsEditor({
  settings,
  onSave,
  onCancel,
  isSaving,
}: {
  settings: SmsSettings | null;
  onSave: (data: Partial<SmsSettings>) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState({
    provider: settings?.provider || "wiretap",
    api_key: "",
    api_secret: "",
    from_number: settings?.from_number || "",
    webhook_url: settings?.webhook_url || "",
    is_active: settings?.is_active ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 p-4 bg-white rounded-xl border border-gray-200">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
          <select
            value={formData.provider}
            onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
          >
            <option value="wiretap">Wiretap Telecom</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From Number</label>
          <input
            type="text"
            value={formData.from_number}
            onChange={(e) => setFormData({ ...formData, from_number: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            placeholder="+1234567890"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Key {settings?.has_api_key && <span className="text-gray-400">(leave blank to keep)</span>}
          </label>
          <input
            type="password"
            value={formData.api_key}
            onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            placeholder={settings?.has_api_key ? "********" : ""}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Secret {settings?.has_api_secret && <span className="text-gray-400">(leave blank to keep)</span>}
          </label>
          <input
            type="password"
            value={formData.api_secret}
            onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            placeholder={settings?.has_api_secret ? "********" : ""}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL (optional)</label>
          <input
            type="url"
            value={formData.webhook_url}
            onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            placeholder="https://your-app.com/api/sms/webhook"
          />
        </div>
        <div className="flex items-center">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm text-gray-700">Active</span>
          </label>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <Button type="submit" disabled={isSaving} size="sm">
          {isSaving ? "Saving..." : "Save SMS Settings"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} size="sm">
          Cancel
        </Button>
      </div>
    </form>
  );
}

function PushEditor({
  settings,
  onSave,
  onCancel,
  isSaving,
}: {
  settings: PushSettings | null;
  onSave: (data: Partial<PushSettings>) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState({
    provider: settings?.provider || "firebase",
    firebase_project_id: settings?.firebase_project_id || "",
    firebase_private_key: "",
    firebase_client_email: settings?.firebase_client_email || "",
    is_active: settings?.is_active ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 p-4 bg-white rounded-xl border border-gray-200">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
          <select
            value={formData.provider}
            onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
          >
            <option value="firebase">Firebase Cloud Messaging</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Firebase Project ID</label>
          <input
            type="text"
            value={formData.firebase_project_id}
            onChange={(e) => setFormData({ ...formData, firebase_project_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
            placeholder="my-firebase-project"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Firebase Client Email</label>
          <input
            type="email"
            value={formData.firebase_client_email}
            onChange={(e) => setFormData({ ...formData, firebase_client_email: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
            placeholder="firebase-adminsdk@project.iam.gserviceaccount.com"
          />
        </div>
        <div className="flex items-center">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm text-gray-700">Active</span>
          </label>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Firebase Private Key (JSON) {settings?.has_firebase_key && <span className="text-gray-400">(leave blank to keep)</span>}
          </label>
          <textarea
            value={formData.firebase_private_key}
            onChange={(e) => setFormData({ ...formData, firebase_private_key: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono text-sm"
            rows={4}
            placeholder={settings?.has_firebase_key ? "Leave blank to keep current key" : "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"}
          />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <Button type="submit" disabled={isSaving} size="sm">
          {isSaving ? "Saving..." : "Save Push Settings"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} size="sm">
          Cancel
        </Button>
      </div>
    </form>
  );
}
