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
  FolderSync,
} from "lucide-react";

interface SetupFormData {
  // Database connection (required)
  threecx_host: string;
  threecx_port: string;
  threecx_database: string;
  threecx_user: string;
  threecx_password: string;
  // SFTP connection (optional - for file backup)
  sftp_host: string;
  sftp_port: string;
  sftp_user: string;
  sftp_password: string;
  // File paths
  threecx_chat_files_path: string;
}

const defaultFormData: SetupFormData = {
  threecx_host: "",
  threecx_port: "5432",
  threecx_database: "database_single",
  threecx_user: "phonesystem",
  threecx_password: "",
  sftp_host: "",
  sftp_port: "22",
  sftp_user: "",
  sftp_password: "",
  threecx_chat_files_path: "/var/lib/3cxpbx/Instance1/Data/Http/Files/Chat Files",
};

export default function TenantSetupPage() {
  const { profile, currentTenant, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [formData, setFormData] = useState<SetupFormData>(defaultFormData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"success" | "error" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    if (!authLoading && profile?.role !== "admin" && profile?.role !== "super_admin") {
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
            threecx_port: String(data.config.threecx_port || 5432),
            threecx_database: data.config.threecx_database || "database_single",
            threecx_user: data.config.threecx_user || "phonesystem",
            threecx_password: "", // Don't show existing password
            sftp_host: data.config.sftp_host || "",
            sftp_port: String(data.config.sftp_port || 22),
            sftp_user: data.config.sftp_user || "",
            sftp_password: "", // Don't show existing password
            threecx_chat_files_path: data.config.threecx_chat_files_path || defaultFormData.threecx_chat_files_path,
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
    try {
      const response = await fetch("/api/tenant/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: formData.threecx_host,
          port: parseInt(formData.threecx_port),
          database: formData.threecx_database,
          user: formData.threecx_user,
          password: formData.threecx_password,
        }),
      });
      setConnectionStatus(response.ok ? "success" : "error");
    } catch (error) {
      setConnectionStatus("error");
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      // Build payload - only include SFTP fields if they have values
      const payload: Record<string, unknown> = {
        threecx_host: formData.threecx_host,
        threecx_port: formData.threecx_port,
        threecx_database: formData.threecx_database,
        threecx_user: formData.threecx_user,
        threecx_chat_files_path: formData.threecx_chat_files_path,
      };

      if (formData.threecx_password) {
        payload.threecx_password = formData.threecx_password;
      }

      // Include SFTP settings if host is provided
      if (formData.sftp_host || formData.sftp_user) {
        payload.sftp_host = formData.sftp_host || formData.threecx_host; // Default to same host
        payload.sftp_port = formData.sftp_port;
        payload.sftp_user = formData.sftp_user;
        if (formData.sftp_password) {
          payload.sftp_password = formData.sftp_password;
        }
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
          {isConfigured ? "3CX Configuration" : "Welcome! Let's Set Up Your 3CX Connection"}
        </h1>
        <p className="text-slate-500 mt-2 max-w-lg mx-auto">
          {isConfigured
            ? "Update your 3CX connection settings"
            : "Configure the connection to your 3CX server to start archiving chat messages."}
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
              <h3 className="font-semibold text-slate-800">What you'll need</h3>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-teal-500" />
                  Your 3CX server IP address or hostname
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-teal-500" />
                  PostgreSQL database credentials (3CX V20 uses port 5432)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-teal-500" />
                  Network access from our servers to your 3CX instance
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-teal-500" />
                  SFTP/SSH credentials (optional - for recording/voicemail backup)
                </li>
              </ul>
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
                <h3 className="font-semibold text-slate-800">Server Connection</h3>
                <p className="text-sm text-slate-500">Enter your 3CX server details</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Port
                </label>
                <Input
                  placeholder="5432"
                  value={formData.threecx_port}
                  onChange={(e) => setFormData({ ...formData, threecx_port: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Database Credentials */}
          <div>
            <div className="flex items-center gap-3 pb-4 border-b border-slate-200 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Database className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Database Credentials</h3>
                <p className="text-sm text-slate-500">PostgreSQL database access for chat sync</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Database Name
                </label>
                <Input
                  placeholder="database_single"
                  value={formData.threecx_database}
                  onChange={(e) => setFormData({ ...formData, threecx_database: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Username
                </label>
                <Input
                  placeholder="phonesystem"
                  value={formData.threecx_user}
                  onChange={(e) => setFormData({ ...formData, threecx_user: e.target.value })}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Password *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input
                  type="password"
                  placeholder={isConfigured ? "Leave blank to keep existing" : "Enter database password"}
                  value={formData.threecx_password}
                  onChange={(e) => setFormData({ ...formData, threecx_password: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* SFTP Credentials - For File Backup */}
          <div>
            <div className="flex items-center gap-3 pb-4 border-b border-slate-200 mb-4">
              <div className="p-2 bg-purple-100 rounded-lg">
                <FolderSync className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">SFTP Access <span className="text-slate-400 font-normal">(Optional)</span></h3>
                <p className="text-sm text-slate-500">Required for backing up recordings, voicemails, and faxes</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  SFTP Host
                </label>
                <Input
                  placeholder="Same as 3CX host (leave blank)"
                  value={formData.sftp_host}
                  onChange={(e) => setFormData({ ...formData, sftp_host: e.target.value })}
                />
                <p className="text-xs text-slate-500 mt-1">Leave blank to use the 3CX host above</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  SFTP Port
                </label>
                <Input
                  placeholder="22"
                  value={formData.sftp_port}
                  onChange={(e) => setFormData({ ...formData, sftp_port: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  SFTP Username
                </label>
                <Input
                  placeholder="root or ssh user"
                  value={formData.sftp_user}
                  onChange={(e) => setFormData({ ...formData, sftp_user: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  SFTP Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    type="password"
                    placeholder={isConfigured ? "Leave blank to keep existing" : "Enter SSH/SFTP password"}
                    value={formData.sftp_password}
                    onChange={(e) => setFormData({ ...formData, sftp_password: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 mt-3 p-3 bg-slate-50 rounded-lg">
              <strong>Note:</strong> SFTP access is only needed for file backups (recordings, voicemails, faxes).
              Chat messages sync via the database connection and don't require SFTP.
            </p>
          </div>

          {/* Chat Files Path */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Chat Files Path (for media sync via SFTP)
            </label>
            <Input
              placeholder="/var/lib/3cxpbx/Instance1/Data/Http/Files/Chat Files"
              value={formData.threecx_chat_files_path}
              onChange={(e) => setFormData({ ...formData, threecx_chat_files_path: e.target.value })}
            />
            <p className="text-xs text-slate-500 mt-1">
              The path on your 3CX server where chat media files are stored
            </p>
          </div>

          {/* Test Connection */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-slate-800">Test Database Connection</h4>
                <p className="text-sm text-slate-500">Verify the database settings before saving</p>
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
                  disabled={!formData.threecx_host || !formData.threecx_password}
                >
                  Test Connection
                </Button>
              </div>
            </div>
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
            disabled={!formData.threecx_host || (!isConfigured && !formData.threecx_password)}
          >
            {isConfigured ? "Save Changes" : "Save & Continue"}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
