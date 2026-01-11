"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Settings, Download, Trash2, Bell, Clock, Shield, Archive, Infinity } from "lucide-react";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";

interface RetentionPolicy {
  data_type: string;
  label: string;
  description: string;
  retention_days: number | null;
  is_enabled: boolean;
  last_cleanup_at: string | null;
}

export default function SettingsPage() {
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchPolicies();
  }, []);

  async function fetchPolicies() {
    try {
      const response = await fetch("/api/admin/retention");
      const data = await response.json();
      if (data.policies) {
        setPolicies(data.policies);
      }
    } catch (error) {
      console.error("Failed to fetch retention policies:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function savePolicies() {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const response = await fetch("/api/admin/retention", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policies }),
      });

      if (response.ok) {
        setSaveMessage({ type: "success", text: "Retention policies saved successfully" });
      } else {
        const data = await response.json();
        setSaveMessage({ type: "error", text: data.error || "Failed to save policies" });
      }
    } catch (error) {
      setSaveMessage({ type: "error", text: "Failed to save policies" });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }

  function updatePolicy(dataType: string, field: "retention_days" | "is_enabled", value: number | null | boolean) {
    setPolicies((prev) =>
      prev.map((p) =>
        p.data_type === dataType ? { ...p, [field]: value } : p
      )
    );
  }

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl shadow-lg shadow-teal-500/25">
          <Settings className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Settings</h1>
          <p className="text-slate-500 mt-1">Manage your backup preferences</p>
        </div>
      </div>

      {/* Retention Policies */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Data Retention Policies</h2>
          {saveMessage && (
            <div
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                saveMessage.type === "success"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {saveMessage.text}
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
            <div className="flex items-start gap-3">
              <Archive className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-800">About Retention Policies</h4>
                <p className="text-sm text-blue-600 mt-1">
                  Configure how long each type of data is kept. Set to &quot;Keep Forever&quot; to never delete data,
                  or specify a number of days after which old data will be automatically removed.
                </p>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {policies.map((policy) => (
                <div
                  key={policy.data_type}
                  className="flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-violet-100 rounded-lg">
                      <Archive className="h-5 w-5 text-violet-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800">{policy.label}</h3>
                      <p className="text-sm text-slate-500">{policy.description}</p>
                      {policy.last_cleanup_at && (
                        <p className="text-xs text-slate-400 mt-1">
                          Last cleanup: {new Date(policy.last_cleanup_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <select
                        value={policy.retention_days === null ? "forever" : policy.retention_days}
                        onChange={(e) => {
                          const value = e.target.value;
                          updatePolicy(
                            policy.data_type,
                            "retention_days",
                            value === "forever" ? null : parseInt(value)
                          );
                        }}
                        className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 text-sm font-medium min-w-[150px]"
                      >
                        <option value="forever">Keep Forever</option>
                        <option value="30">30 days</option>
                        <option value="60">60 days</option>
                        <option value="90">90 days</option>
                        <option value="180">6 months</option>
                        <option value="365">1 year</option>
                        <option value="730">2 years</option>
                        <option value="1825">5 years</option>
                        <option value="3650">10 years</option>
                      </select>
                      {policy.retention_days === null && (
                        <Infinity className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={policy.is_enabled}
                        onChange={(e) =>
                          updatePolicy(policy.data_type, "is_enabled", e.target.checked)
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
                    </label>
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-4">
                <Button onClick={savePolicies} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Retention Policies"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sync Settings */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Sync Settings</h2>
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Sync Interval</h3>
                  <p className="text-sm text-slate-500">How often to sync data from 3CX</p>
                </div>
              </div>
              <select className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium">
                <option value="60">Every minute</option>
                <option value="300">Every 5 minutes</option>
                <option value="900">Every 15 minutes</option>
                <option value="3600">Every hour</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Notifications</h2>
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Bell className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Email Notifications</h3>
                  <p className="text-sm text-slate-500">Get notified about sync errors</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Security</h2>

        {/* Two-Factor Authentication */}
        <TwoFactorSetup />

        {/* Change Password */}
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <div className="flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-violet-100 rounded-lg">
                <Shield className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Change Password</h3>
                <p className="text-sm text-slate-500">Update your account password</p>
              </div>
            </div>
            <Button variant="outline">Change</Button>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Data Management</h2>
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <div className="space-y-6">
            {/* Export Options */}
            <div className="p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-2 bg-teal-100 rounded-lg">
                  <Download className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Export Data</h3>
                  <p className="text-sm text-slate-500">Download backups in JSON or CSV format</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <a
                  href="/api/export?type=all&format=json"
                  className="px-4 py-2 bg-teal-500 text-white text-sm font-medium rounded-lg hover:bg-teal-600 text-center"
                >
                  Full Backup (JSON)
                </a>
                <a
                  href="/api/export?type=messages&format=csv"
                  className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 text-center"
                >
                  Messages (CSV)
                </a>
                <a
                  href="/api/export?type=call_logs&format=csv"
                  className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 text-center"
                >
                  Call Logs (CSV)
                </a>
                <a
                  href="/api/export?type=recordings&format=json"
                  className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 text-center"
                >
                  Recordings (JSON)
                </a>
              </div>
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
