"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Settings, Download, Trash2, Bell, Clock, Shield, Archive, Infinity, User, HardDrive } from "lucide-react";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";
import { createClient } from "@/lib/supabase/client";

interface RetentionPolicy {
  data_type: string;
  label: string;
  description: string;
  retention_days: number | null;
  is_enabled: boolean;
  last_cleanup_at: string | null;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
}

interface TenantConfig {
  backup_chats: boolean;
  backup_chat_media: boolean;
  backup_recordings: boolean;
  backup_voicemails: boolean;
  backup_faxes: boolean;
  backup_cdr: boolean;
  backup_meetings: boolean;
  sync_interval_seconds: number;
}

const BACKUP_TYPES = [
  { key: "backup_chats", label: "Chat Messages", description: "Text messages and conversation history" },
  { key: "backup_chat_media", label: "Chat Media", description: "Images, videos, and file attachments from chats" },
  { key: "backup_recordings", label: "Call Recordings", description: "Audio recordings of phone calls" },
  { key: "backup_voicemails", label: "Voicemails", description: "Voice messages left by callers" },
  { key: "backup_faxes", label: "Faxes", description: "Sent and received fax documents" },
  { key: "backup_cdr", label: "Call Logs (CDR)", description: "Call detail records and call history" },
  { key: "backup_meetings", label: "Meeting Recordings", description: "Web meeting recordings and transcripts" },
] as const;

export default function SettingsPage() {
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Tenant config state (backup toggles + sync interval)
  const [tenantConfig, setTenantConfig] = useState<TenantConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchPolicies();
    fetchProfile();
    fetchTenantConfig();
  }, []);

  async function fetchProfile() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: profileData } = await supabase
          .from("user_profiles")
          .select("id, email, full_name")
          .eq("id", user.id)
          .single();

        if (profileData) {
          setProfile(profileData);
        } else {
          // Fallback to auth user data
          setProfile({
            id: user.id,
            email: user.email || "",
            full_name: user.user_metadata?.full_name || null,
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setProfileLoading(false);
    }
  }

  async function saveProfile() {
    if (!profile) return;

    setProfileSaving(true);
    setProfileMessage(null);

    try {
      const response = await fetch(`/api/admin/users/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: profile.full_name,
          email: profile.email,
        }),
      });

      if (response.ok) {
        setProfileMessage({ type: "success", text: "Profile updated successfully" });
      } else {
        const data = await response.json();
        setProfileMessage({ type: "error", text: data.error || "Failed to update profile" });
      }
    } catch (error) {
      setProfileMessage({ type: "error", text: "Failed to update profile" });
    } finally {
      setProfileSaving(false);
      setTimeout(() => setProfileMessage(null), 3000);
    }
  }

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

  async function fetchTenantConfig() {
    try {
      const response = await fetch("/api/tenant/config");
      if (response.ok) {
        const data = await response.json();
        setTenantConfig({
          backup_chats: data.backup_chats ?? true,
          backup_chat_media: data.backup_chat_media ?? true,
          backup_recordings: data.backup_recordings ?? true,
          backup_voicemails: data.backup_voicemails ?? true,
          backup_faxes: data.backup_faxes ?? true,
          backup_cdr: data.backup_cdr ?? true,
          backup_meetings: data.backup_meetings ?? true,
          sync_interval_seconds: data.sync_interval_seconds ?? 60,
        });
      }
    } catch (error) {
      console.error("Failed to fetch tenant config:", error);
    } finally {
      setConfigLoading(false);
    }
  }

  async function saveTenantConfig() {
    if (!tenantConfig) return;

    setConfigSaving(true);
    setConfigMessage(null);

    try {
      const response = await fetch("/api/tenant/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tenantConfig),
      });

      if (response.ok) {
        setConfigMessage({ type: "success", text: "Sync settings saved successfully" });
      } else {
        const data = await response.json();
        setConfigMessage({ type: "error", text: data.error || "Failed to save settings" });
      }
    } catch (error) {
      setConfigMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setConfigSaving(false);
      setTimeout(() => setConfigMessage(null), 3000);
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

      {/* Profile Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Your Profile</h2>
          {profileMessage && (
            <div
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                profileMessage.type === "success"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {profileMessage.text}
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          {profileLoading ? (
            <div className="space-y-4">
              <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
              <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
            </div>
          ) : profile ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200">
                <div className="p-3 bg-teal-100 rounded-full">
                  <User className="h-6 w-6 text-teal-600" />
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Full Name</label>
                    <Input
                      type="text"
                      value={profile.full_name || ""}
                      onChange={(e) => setProfile({ ...profile, full_name: e.target.value || null })}
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
                    <Input
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      placeholder="your@email.com"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveProfile} disabled={profileSaving}>
                  {profileSaving ? "Saving..." : "Save Profile"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-slate-500">Unable to load profile</p>
          )}
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
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Sync Settings</h2>
          {configMessage && (
            <div
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                configMessage.type === "success"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {configMessage.text}
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          {configLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : tenantConfig ? (
            <div className="space-y-6">
              {/* Sync Interval */}
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
                <select
                  value={tenantConfig.sync_interval_seconds}
                  onChange={(e) => setTenantConfig({ ...tenantConfig, sync_interval_seconds: parseInt(e.target.value) })}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium"
                >
                  <option value="60">Every minute</option>
                  <option value="300">Every 5 minutes</option>
                  <option value="900">Every 15 minutes</option>
                  <option value="3600">Every hour</option>
                </select>
              </div>

              {/* Backup Type Toggles */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-teal-100 rounded-lg">
                    <HardDrive className="h-5 w-5 text-teal-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">Backup Types</h3>
                    <p className="text-sm text-slate-500">Choose which data types to sync from 3CX</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {BACKUP_TYPES.map(({ key, label, description }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200"
                    >
                      <div>
                        <h4 className="font-semibold text-slate-800">{label}</h4>
                        <p className="text-sm text-slate-500">{description}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tenantConfig[key]}
                          onChange={(e) =>
                            setTenantConfig({ ...tenantConfig, [key]: e.target.checked })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={saveTenantConfig} disabled={configSaving}>
                  {configSaving ? "Saving..." : "Save Sync Settings"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-slate-500">Unable to load sync settings</p>
          )}
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
