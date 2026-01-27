"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Mail, Send, Check, X, Eye, EyeOff, Loader2, Server, Zap } from "lucide-react";

interface EmailSettings {
  id?: string;
  provider: "smtp" | "sendgrid";
  host: string | null;
  port: number;
  username: string | null;
  from_email: string;
  from_name: string;
  encryption: "none" | "tls" | "ssl";
  is_active: boolean;
  has_password: boolean;
  has_sendgrid_api_key: boolean;
}

interface EmailCategory {
  id: string;
  category: string;
  label: string;
  description: string;
  from_email: string | null;
  from_name: string | null;
}

const DEFAULT_CATEGORIES: Omit<EmailCategory, "id" | "from_email" | "from_name">[] = [
  { category: "welcome", label: "Welcome Emails", description: "New user registration and invitations" },
  { category: "billing", label: "Billing Emails", description: "Invoices, payment confirmations, subscription updates" },
  { category: "notifications", label: "Notification Emails", description: "Sync alerts, storage warnings, system notifications" },
  { category: "security", label: "Security Emails", description: "Password resets, 2FA codes, login alerts" },
];

export function EmailSettingsSection() {
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [categories, setCategories] = useState<EmailCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    provider: "smtp" as "smtp" | "sendgrid",
    host: "",
    port: 587,
    username: "",
    password: "",
    sendgrid_api_key: "",
    from_email: "",
    from_name: "3CX BackupWiz",
    encryption: "tls" as "none" | "tls" | "ssl",
    is_active: true,
  });

  useEffect(() => {
    fetchSettings();
    fetchCategories();
  }, []);

  async function fetchSettings() {
    try {
      const response = await fetch("/api/admin/smtp");
      const data = await response.json();
      if (data.settings) {
        setSettings(data.settings);
        setFormData({
          provider: data.settings.provider || "smtp",
          host: data.settings.host || "",
          port: data.settings.port || 587,
          username: data.settings.username || "",
          password: "",
          sendgrid_api_key: "",
          from_email: data.settings.from_email || "",
          from_name: data.settings.from_name || "3CX BackupWiz",
          encryption: data.settings.encryption || "tls",
          is_active: data.settings.is_active ?? true,
        });
      }
    } catch (error) {
      console.error("Failed to fetch email settings:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchCategories() {
    try {
      const response = await fetch("/api/admin/email-categories");
      const data = await response.json();
      if (data.categories) {
        setCategories(data.categories);
      } else {
        // Initialize with defaults if no categories exist
        setCategories(DEFAULT_CATEGORIES.map((c, i) => ({
          id: `temp-${i}`,
          ...c,
          from_email: null,
          from_name: null,
        })));
      }
    } catch (error) {
      console.error("Failed to fetch email categories:", error);
      // Use defaults on error
      setCategories(DEFAULT_CATEGORIES.map((c, i) => ({
        id: `temp-${i}`,
        ...c,
        from_email: null,
        from_name: null,
      })));
    }
  }

  async function saveSettings() {
    setIsSaving(true);
    setMessage(null);

    try {
      const method = settings?.id ? "PUT" : "POST";
      const body = {
        ...formData,
        id: settings?.id,
      };

      // Don't send empty password/api_key (keep existing)
      if (!body.password) delete (body as Record<string, unknown>).password;
      if (!body.sendgrid_api_key) delete (body as Record<string, unknown>).sendgrid_api_key;

      const response = await fetch("/api/admin/smtp", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data.settings);
        setMessage({ type: "success", text: "Email settings saved successfully" });
        // Clear password fields after save
        setFormData((prev) => ({ ...prev, password: "", sendgrid_api_key: "" }));
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "Failed to save settings" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setIsSaving(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }

  async function saveCategories() {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/email-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories }),
      });

      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories);
        setMessage({ type: "success", text: "Email categories saved successfully" });
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "Failed to save categories" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save categories" });
    } finally {
      setIsSaving(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }

  async function sendTestEmail() {
    if (!testEmail) {
      setTestResult({ success: false, message: "Please enter a test email address" });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/admin/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setTestResult({ success: true, message: "Test email sent successfully! Check your inbox." });
      } else {
        setTestResult({ success: false, message: data.error || "Failed to send test email" });
      }
    } catch (error) {
      setTestResult({ success: false, message: "Failed to send test email" });
    } finally {
      setIsTesting(false);
    }
  }

  function updateCategory(category: string, field: "from_email" | "from_name", value: string) {
    setCategories((prev) =>
      prev.map((c) =>
        c.category === category ? { ...c, [field]: value || null } : c
      )
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
        <div className="space-y-4">
          <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
          <div className="h-32 bg-slate-100 rounded-xl animate-pulse" />
          <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Message */}
      {message && (
        <div
          className={`px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
            message.type === "success"
              ? "bg-green-100 text-green-700 border border-green-200"
              : "bg-red-100 text-red-700 border border-red-200"
          }`}
        >
          {message.type === "success" ? (
            <Check className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4" />
          )}
          {message.text}
        </div>
      )}

      {/* Provider Selection */}
      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Email Provider</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => setFormData((prev) => ({ ...prev, provider: "sendgrid" }))}
            className={`p-4 rounded-xl border-2 transition-all ${
              formData.provider === "sendgrid"
                ? "border-teal-500 bg-teal-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${formData.provider === "sendgrid" ? "bg-teal-100" : "bg-slate-100"}`}>
                <Zap className={`h-5 w-5 ${formData.provider === "sendgrid" ? "text-teal-600" : "text-slate-500"}`} />
              </div>
              <div className="text-left">
                <h4 className="font-semibold text-slate-800">SendGrid</h4>
                <p className="text-sm text-slate-500">Recommended for production</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => setFormData((prev) => ({ ...prev, provider: "smtp" }))}
            className={`p-4 rounded-xl border-2 transition-all ${
              formData.provider === "smtp"
                ? "border-teal-500 bg-teal-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${formData.provider === "smtp" ? "bg-teal-100" : "bg-slate-100"}`}>
                <Server className={`h-5 w-5 ${formData.provider === "smtp" ? "text-teal-600" : "text-slate-500"}`} />
              </div>
              <div className="text-left">
                <h4 className="font-semibold text-slate-800">SMTP Server</h4>
                <p className="text-sm text-slate-500">Custom mail server</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Provider Configuration */}
      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">
          {formData.provider === "sendgrid" ? "SendGrid Configuration" : "SMTP Configuration"}
        </h3>

        {formData.provider === "sendgrid" ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">SendGrid API Key</label>
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={formData.sendgrid_api_key}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sendgrid_api_key: e.target.value }))}
                  placeholder={settings?.has_sendgrid_api_key ? "••••••••••••••••" : "SG.xxxxxxxx"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Get your API key from the{" "}
                <a href="https://app.sendgrid.com/settings/api_keys" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
                  SendGrid Dashboard
                </a>
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">SMTP Host</label>
                <Input
                  type="text"
                  value={formData.host}
                  onChange={(e) => setFormData((prev) => ({ ...prev, host: e.target.value }))}
                  placeholder="smtp.example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Port</label>
                <Input
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData((prev) => ({ ...prev, port: parseInt(e.target.value) || 587 }))}
                  placeholder="587"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Username</label>
                <Input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder={settings?.has_password ? "••••••••" : "App password or SMTP password"}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Encryption</label>
              <select
                value={formData.encryption}
                onChange={(e) => setFormData((prev) => ({ ...prev, encryption: e.target.value as "none" | "tls" | "ssl" }))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800"
              >
                <option value="tls">TLS (Port 587)</option>
                <option value="ssl">SSL (Port 465)</option>
                <option value="none">None (Port 25)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* From Address */}
      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Default From Address</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">From Name</label>
            <Input
              type="text"
              value={formData.from_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, from_name: e.target.value }))}
              placeholder="3CX BackupWiz"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">From Email</label>
            <Input
              type="email"
              value={formData.from_email}
              onChange={(e) => setFormData((prev) => ({ ...prev, from_email: e.target.value }))}
              placeholder="noreply@yourdomain.com"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
          </label>
          <span className="text-sm text-slate-600">Enable email sending</span>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={saveSettings} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Email Settings"
            )}
          </Button>
        </div>
      </div>

      {/* Category-specific From Addresses */}
      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Category-Specific Addresses</h3>
        <p className="text-sm text-slate-500 mb-4">
          Override the default from address for specific email types. Leave blank to use the default.
        </p>
        <div className="space-y-4">
          {categories.map((cat) => (
            <div key={cat.category} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <h4 className="font-medium text-slate-800">{cat.label}</h4>
                  <p className="text-xs text-slate-500">{cat.description}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  type="text"
                  value={cat.from_name || ""}
                  onChange={(e) => updateCategory(cat.category, "from_name", e.target.value)}
                  placeholder={`${formData.from_name} (default)`}
                  className="text-sm"
                />
                <Input
                  type="email"
                  value={cat.from_email || ""}
                  onChange={(e) => updateCategory(cat.category, "from_email", e.target.value)}
                  placeholder={`${formData.from_email || "default@example.com"} (default)`}
                  className="text-sm"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={saveCategories} disabled={isSaving} variant="outline">
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Category Settings"
            )}
          </Button>
        </div>
      </div>

      {/* Test Email */}
      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Test Email Configuration</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Enter email to send test"
            />
          </div>
          <Button onClick={sendTestEmail} disabled={isTesting || !settings?.is_active}>
            {isTesting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Test Email
              </>
            )}
          </Button>
        </div>
        {testResult && (
          <div
            className={`mt-3 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
              testResult.success
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {testResult.success ? (
              <Check className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
            {testResult.message}
          </div>
        )}
        {!settings?.is_active && (
          <p className="mt-2 text-sm text-amber-600">
            Enable email sending above to test your configuration.
          </p>
        )}
      </div>
    </div>
  );
}
