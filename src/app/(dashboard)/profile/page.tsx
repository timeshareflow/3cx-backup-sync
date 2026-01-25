"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Camera,
  Mail,
  Shield,
  Key,
  Bell,
  Smartphone,
  Clock,
  CheckCircle,
  AlertCircle,
  Save,
  Loader2,
  Upload,
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  totp_enabled: boolean;
  created_at: string;
  last_login_at: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Password change state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: profileData, error } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (profileData) {
          setProfile(profileData);
          if (profileData.avatar_url) {
            setAvatarPreview(profileData.avatar_url);
          }
        } else if (error) {
          console.error("Error fetching profile:", error);
        }
      }
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "Please select an image file" });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "Image must be less than 5MB" });
      return;
    }

    setIsUploadingAvatar(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setProfile({ ...profile, avatar_url: data.avatar_url });
        setAvatarPreview(data.avatar_url);
        setMessage({ type: "success", text: "Avatar updated successfully" });
      } else {
        const error = await response.json();
        setMessage({ type: "error", text: error.error || "Failed to upload avatar" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to upload avatar" });
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleRemoveAvatar() {
    if (!profile) return;

    setIsUploadingAvatar(true);
    try {
      const response = await fetch("/api/profile/avatar", {
        method: "DELETE",
      });

      if (response.ok) {
        setProfile({ ...profile, avatar_url: null });
        setAvatarPreview(null);
        setMessage({ type: "success", text: "Avatar removed" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to remove avatar" });
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleSaveProfile() {
    if (!profile) return;

    setIsSaving(true);
    setMessage(null);

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
        setMessage({ type: "success", text: "Profile updated successfully" });
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "Failed to update profile" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to update profile" });
    } finally {
      setIsSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  }

  async function handleChangePassword() {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({ type: "error", text: "Passwords do not match" });
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordMessage({ type: "error", text: "Password must be at least 8 characters" });
      return;
    }

    setIsChangingPassword(true);
    setPasswordMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      });

      if (error) {
        setPasswordMessage({ type: "error", text: error.message });
      } else {
        setPasswordMessage({ type: "success", text: "Password changed successfully" });
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      }
    } catch (error) {
      setPasswordMessage({ type: "error", text: "Failed to change password" });
    } finally {
      setIsChangingPassword(false);
      setTimeout(() => setPasswordMessage(null), 4000);
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-teal-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-slate-700 font-medium">Unable to load profile</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl shadow-lg shadow-violet-500/25">
          <User className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">My Profile</h1>
          <p className="text-slate-500 mt-1">Manage your account settings and preferences</p>
        </div>
      </div>

      {/* Profile Card - Avatar & Basic Info */}
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
        {/* Cover gradient */}
        <div className="h-32 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 relative">
          <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent" />
        </div>

        <div className="px-8 pb-8 -mt-16 relative">
          {/* Avatar */}
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6">
            <div className="relative group">
              <div className="w-32 h-32 rounded-2xl border-4 border-white shadow-xl overflow-hidden bg-gradient-to-br from-violet-100 to-purple-100">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600">
                    <span className="text-4xl font-bold text-white">
                      {profile.full_name?.charAt(0) || profile.email?.charAt(0).toUpperCase() || "U"}
                    </span>
                  </div>
                )}
              </div>

              {/* Upload overlay */}
              <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                   onClick={() => fileInputRef.current?.click()}>
                {isUploadingAvatar ? (
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                ) : (
                  <Camera className="h-8 w-8 text-white" />
                )}
              </div>

              {/* Remove button */}
              {avatarPreview && (
                <button
                  onClick={handleRemoveAvatar}
                  className="absolute -top-2 -right-2 p-1.5 bg-red-500 rounded-full text-white shadow-lg hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>

            <div className="flex-1 text-center sm:text-left pb-2">
              <div className="flex items-center justify-center sm:justify-start gap-3 mb-1">
                <h2 className="text-2xl font-bold text-slate-800">
                  {profile.full_name || profile.email.split("@")[0]}
                </h2>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                  profile.role === "super_admin"
                    ? "bg-gradient-to-r from-violet-500 to-purple-500 text-white"
                    : profile.role === "admin"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-700"
                }`}>
                  {profile.role.replace("_", " ")}
                </span>
              </div>
              <p className="text-slate-500 flex items-center justify-center sm:justify-start gap-2">
                <Mail className="h-4 w-4" />
                {profile.email}
              </p>
            </div>

            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="flex items-center gap-2"
              disabled={isUploadingAvatar}
            >
              <Upload className="h-4 w-4" />
              Upload Photo
            </Button>
          </div>

          {/* Message */}
          {message && (
            <div className={`mt-6 p-4 rounded-xl flex items-center gap-3 ${
              message.type === "success"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {message.type === "success" ? (
                <CheckCircle className="h-5 w-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
              )}
              <span className="font-medium">{message.text}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Information */}
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-lg shadow-teal-500/25">
              <User className="h-5 w-5 text-white" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Profile Information</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">Full Name</label>
              <Input
                type="text"
                value={profile.full_name || ""}
                onChange={(e) => setProfile({ ...profile, full_name: e.target.value || null })}
                placeholder="Enter your full name"
                className="bg-slate-50 border-slate-200 focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">Email Address</label>
              <Input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                placeholder="your@email.com"
                className="bg-slate-50 border-slate-200 focus:border-teal-500"
              />
            </div>

            <Button
              onClick={handleSaveProfile}
              disabled={isSaving}
              className="w-full mt-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Account Stats */}
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg shadow-amber-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Account Details</h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-200 rounded-lg">
                  <Clock className="h-4 w-4 text-slate-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Member Since</p>
                  <p className="font-semibold text-slate-800">{formatDate(profile.created_at)}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-200 rounded-lg">
                  <Clock className="h-4 w-4 text-slate-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Last Login</p>
                  <p className="font-semibold text-slate-800">{formatDate(profile.last_login_at)}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${profile.totp_enabled ? "bg-emerald-100" : "bg-amber-100"}`}>
                  <Shield className={`h-4 w-4 ${profile.totp_enabled ? "text-emerald-600" : "text-amber-600"}`} />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Two-Factor Auth</p>
                  <p className={`font-semibold ${profile.totp_enabled ? "text-emerald-600" : "text-amber-600"}`}>
                    {profile.totp_enabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Security Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Change Password */}
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg shadow-red-500/25">
              <Key className="h-5 w-5 text-white" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Change Password</h3>
          </div>

          {passwordMessage && (
            <div className={`mb-4 p-4 rounded-xl flex items-center gap-3 ${
              passwordMessage.type === "success"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {passwordMessage.type === "success" ? (
                <CheckCircle className="h-5 w-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
              )}
              <span className="font-medium">{passwordMessage.text}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">New Password</label>
              <Input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="Enter new password"
                className="bg-slate-50 border-slate-200 focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">Confirm Password</label>
              <Input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                placeholder="Confirm new password"
                className="bg-slate-50 border-slate-200 focus:border-red-500"
              />
            </div>

            <Button
              onClick={handleChangePassword}
              disabled={isChangingPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
              variant="danger"
              className="w-full mt-2"
            >
              {isChangingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Changing...
                </>
              ) : (
                <>
                  <Key className="h-4 w-4 mr-2" />
                  Change Password
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl shadow-lg shadow-emerald-500/25">
              <Smartphone className="h-5 w-5 text-white" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Two-Factor Authentication</h3>
          </div>

          <TwoFactorSetup />
        </div>
      </div>
    </div>
  );
}
