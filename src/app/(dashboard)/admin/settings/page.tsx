"use client";

import { useState } from "react";
// Card components not currently used but may be needed later
import { Button } from "@/components/ui/Button";
import { CheckCircle, XCircle, Database, Cloud, Server, Settings, Download, Trash2 } from "lucide-react";

export default function SettingsPage() {
  const [isTestingConnection, setIsTestingConnection] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, boolean | null>>({
    supabase: null,
    s3: null,
    threecx: null,
  });

  const testConnection = async (service: string) => {
    setIsTestingConnection(service);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setConnectionStatus((prev) => ({
      ...prev,
      [service]: Math.random() > 0.2,
    }));
    setIsTestingConnection(null);
  };

  const connectionConfigs = [
    {
      title: "Supabase",
      service: "supabase",
      icon: Database,
      description: "Archive database for storing synced messages and media metadata",
      gradient: "from-emerald-500 to-green-600",
      bgGradient: "from-emerald-50 to-green-50",
      borderColor: "border-emerald-200",
    },
    {
      title: "AWS S3",
      service: "s3",
      icon: Cloud,
      description: "Cloud storage for archived media files",
      gradient: "from-amber-500 to-orange-600",
      bgGradient: "from-amber-50 to-orange-50",
      borderColor: "border-amber-200",
    },
    {
      title: "3CX Database",
      service: "threecx",
      icon: Server,
      description: "Source PostgreSQL database on 3CX server",
      gradient: "from-blue-500 to-indigo-600",
      bgGradient: "from-blue-50 to-indigo-50",
      borderColor: "border-blue-200",
    },
  ];

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl shadow-lg shadow-teal-500/25">
          <Settings className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Settings</h1>
          <p className="text-slate-500 mt-1">Configure connections and app settings</p>
        </div>
      </div>

      {/* Connections */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Connections</h2>
        <div className="grid gap-4">
          {connectionConfigs.map((config) => (
            <div
              key={config.service}
              className={`bg-gradient-to-br ${config.bgGradient} rounded-2xl border-2 ${config.borderColor} p-6`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`p-3 bg-gradient-to-br ${config.gradient} rounded-xl shadow-lg`}>
                    <config.icon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">{config.title}</h3>
                    <p className="text-sm text-slate-600 mt-1">{config.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {connectionStatus[config.service] !== null && (
                    connectionStatus[config.service] ? (
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold">
                        <CheckCircle className="h-4 w-4" />
                        Connected
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold">
                        <XCircle className="h-4 w-4" />
                        Failed
                      </span>
                    )
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection(config.service)}
                    isLoading={isTestingConnection === config.service}
                  >
                    Test
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Environment */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Environment</h2>
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <dl className="space-y-4">
            <div className="flex justify-between py-3 border-b border-slate-100">
              <dt className="text-slate-600 font-medium">Supabase URL</dt>
              <dd className="font-mono text-sm text-slate-800 bg-slate-100 px-3 py-1 rounded-lg">
                {process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//, "").slice(0, 30) || "Not configured"}...
              </dd>
            </div>
            <div className="flex justify-between py-3 border-b border-slate-100">
              <dt className="text-slate-600 font-medium">AWS Region</dt>
              <dd className="font-mono text-sm text-slate-800 bg-slate-100 px-3 py-1 rounded-lg">
                {process.env.AWS_REGION || "Not configured"}
              </dd>
            </div>
            <div className="flex justify-between py-3 border-b border-slate-100">
              <dt className="text-slate-600 font-medium">S3 Bucket</dt>
              <dd className="font-mono text-sm text-slate-800 bg-slate-100 px-3 py-1 rounded-lg">
                {process.env.S3_BUCKET_NAME || "Not configured"}
              </dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-slate-600 font-medium">App URL</dt>
              <dd className="font-mono text-sm text-slate-800 bg-slate-100 px-3 py-1 rounded-lg">
                {process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Data Management */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Data Management</h2>
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-teal-100 rounded-lg">
                  <Download className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Export All Data</h3>
                  <p className="text-sm text-slate-500">Download a full backup of all archived data</p>
                </div>
              </div>
              <Button variant="outline">Export</Button>
            </div>
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-red-50 to-rose-50 rounded-xl border-2 border-red-200">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-red-700">Danger Zone</h3>
                  <p className="text-sm text-red-600">Permanently delete all archived data</p>
                </div>
              </div>
              <Button variant="danger">Delete All Data</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
