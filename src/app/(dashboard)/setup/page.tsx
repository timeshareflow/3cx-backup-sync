"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import {
  Server,
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings,
  Database,
  Lock,
  ArrowRight,
  Shield,
  Terminal,
} from "lucide-react";

interface SetupFormData {
  // 3CX Server
  threecx_host: string;
  // SSH credentials (used for both database tunnel and file access)
  ssh_port: string;
  ssh_user: string;
  ssh_password: string;
  // PostgreSQL password (connects via SSH tunnel)
  threecx_db_password: string;
}

const defaultFormData: SetupFormData = {
  threecx_host: "",
  ssh_port: "22",
  ssh_user: "root",
  ssh_password: "",
  threecx_db_password: "",
};

export default function TenantSetupPage() {
  const { profile, currentTenant, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [formData, setFormData] = useState<SetupFormData>(defaultFormData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"success" | "error" | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return;

    // If profile is still null after auth loading, wait for it
    if (!profile) return;

    if (profile.role !== "admin" && profile.role !== "super_admin") {
      router.push("/unauthorized");
      return;
    }

    if (currentTenant) {
      fetchCurrentConfig();
    }
  }, [profile, currentTenant, authLoading, router]);

  const fetchCurrentConfig = async () => {
    try {
      const response = await fetch("/api/tenant/config");
      if (response.ok) {
        const data = await response.json();
        if (data.config) {
          setFormData({
            threecx_host: data.config.threecx_host || "",
            ssh_port: String(data.config.ssh_port || 22),
            ssh_user: data.config.ssh_user || "root",
            ssh_password: "", // Don't show existing password
            threecx_db_password: "", // Don't show existing password
          });
          setIsConfigured(!!data.config.threecx_host);
        }
      }
    } catch (error) {
      console.error("Failed to fetch config:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus(null);
    setConnectionError(null);
    try {
      const response = await fetch("/api/tenant/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: formData.threecx_host,
          ssh_port: parseInt(formData.ssh_port),
          ssh_user: formData.ssh_user,
          ssh_password: formData.ssh_password,
          db_password: formData.threecx_db_password,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setConnectionStatus("success");
      } else {
        setConnectionStatus("error");
        setConnectionError(data.error || "Connection failed");
      }
    } catch (error) {
      setConnectionStatus("error");
      setConnectionError((error as Error).message || "Connection failed");
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        threecx_host: formData.threecx_host,
        ssh_port: formData.ssh_port,
        ssh_user: formData.ssh_user,
      };

      if (formData.ssh_password) {
        payload.ssh_password = formData.ssh_password;
      }

      if (formData.threecx_db_password) {
        payload.threecx_db_password = formData.threecx_db_password;
      }

      const response = await fetch("/api/tenant/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setIsConfigured(true);
        router.push("/");
      } else {
        const data = await response.json();
        setError(data.error || "Failed to save configuration");
      }
    } catch (error) {
      console.error("Failed to save config:", error);
      setError("Failed to save configuration");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex p-4 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl shadow-lg shadow-teal-500/25 mb-4">
          <Settings className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-800">
          {isConfigured ? "3CX Configuration" : "Connect Your 3CX Server"}
        </h1>
        <p className="text-slate-500 mt-2 max-w-lg mx-auto">
          {isConfigured
            ? "Update your 3CX connection settings"
            : "Just enter your SSH credentials and database password - that's it!"}
        </p>
      </div>

      {/* Info Card */}
      {!isConfigured && (
        <div className="bg-gradient-to-br from-teal-50 to-cyan-50 border-2 border-teal-200 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-teal-100 rounded-xl">
              <Shield className="h-6 w-6 text-teal-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">Simple Setup - No Server Changes Needed</h3>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-teal-500" />
                  Your 3CX server IP address or hostname
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-teal-500" />
                  SSH login credentials (same as SSH/terminal access)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-teal-500" />
                  PostgreSQL password from <code className="bg-teal-100 px-1 rounded">/var/lib/3cxpbx/Instance1/Bin/3CX.Postgres.ini</code>
                </li>
              </ul>
              <p className="mt-3 text-xs text-teal-700 font-medium">
                We connect securely through SSH - no firewall changes or PostgreSQL configuration needed!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Form */}
      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-8">
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="space-y-6">
          {/* Server Connection */}
          <div>
            <div className="flex items-center gap-3 pb-4 border-b border-slate-200 mb-4">
              <div className="p-2 bg-teal-100 rounded-lg">
                <Server className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">3CX Server</h3>
                <p className="text-sm text-slate-500">Your 3CX server address</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Host / IP Address *
              </label>
              <Input
                placeholder="192.168.1.100 or 3cx.yourcompany.com"
                value={formData.threecx_host}
                onChange={(e) => setFormData({ ...formData, threecx_host: e.target.value })}
              />
            </div>
          </div>

          {/* SSH Credentials */}
          <div>
            <div className="flex items-center gap-3 pb-4 border-b border-slate-200 mb-4">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Terminal className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">SSH Credentials</h3>
                <p className="text-sm text-slate-500">Used for secure access to database and files</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  SSH Username *
                </label>
                <Input
                  placeholder="root"
                  value={formData.ssh_user}
                  onChange={(e) => setFormData({ ...formData, ssh_user: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  SSH Port
                </label>
                <Input
                  placeholder="22"
                  value={formData.ssh_port}
                  onChange={(e) => setFormData({ ...formData, ssh_port: e.target.value })}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                SSH Password *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input
                  type="password"
                  placeholder={isConfigured ? "Leave blank to keep existing" : "Your SSH/server password"}
                  value={formData.ssh_password}
                  onChange={(e) => setFormData({ ...formData, ssh_password: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* Database Password */}
          <div>
            <div className="flex items-center gap-3 pb-4 border-b border-slate-200 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Database className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Database Password</h3>
                <p className="text-sm text-slate-500">PostgreSQL password for the &quot;phonesystem&quot; user</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                PostgreSQL Password *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input
                  type="password"
                  placeholder={isConfigured ? "Leave blank to keep existing" : "From 3CX.Postgres.ini file"}
                  value={formData.threecx_db_password}
                  onChange={(e) => setFormData({ ...formData, threecx_db_password: e.target.value })}
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-slate-500 mt-2 p-3 bg-slate-50 rounded-lg">
                Find this in: <code className="bg-slate-200 px-1 rounded">/var/lib/3cxpbx/Instance1/Bin/3CX.Postgres.ini</code>
                <br />Look for the <code className="bg-slate-200 px-1 rounded">password=</code> line.
              </p>
            </div>
          </div>

          {/* Test Connection */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-slate-800">Test Connection</h4>
                <p className="text-sm text-slate-500">Verify SSH and database access before saving</p>
              </div>
              <div className="flex items-center gap-3">
                {connectionStatus && (
                  <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
                    connectionStatus === "success"
                      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                      : "bg-red-100 text-red-700 border border-red-200"
                  }`}>
                    {connectionStatus === "success" ? (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Connected
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4" />
                        Failed
                      </>
                    )}
                  </span>
                )}
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  isLoading={isTestingConnection}
                  disabled={!formData.threecx_host || !formData.ssh_user || !formData.ssh_password || !formData.threecx_db_password}
                >
                  Test Connection
                </Button>
              </div>
            </div>
            {connectionError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{connectionError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200">
          <Button variant="outline" onClick={() => router.push("/")}>
            {isConfigured ? "Cancel" : "Skip for Now"}
          </Button>
          <Button
            onClick={handleSaveConfig}
            isLoading={isSubmitting}
            disabled={!formData.threecx_host || !formData.ssh_user || (!isConfigured && (!formData.ssh_password || !formData.threecx_db_password))}
          >
            {isConfigured ? "Save Changes" : "Save & Continue"}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
