"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
// Card components available if needed
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import {
  Users,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  ShieldAlert,
  User,
  Trash2,
  Edit,
  Mail,
  Calendar,
  Key,
  LogIn,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/date";
import { UserPermissionsModal } from "@/components/admin/UserPermissionsModal";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: "super_admin" | "admin" | "manager" | "user";
  tenant_role?: "admin" | "manager" | "user"; // Role within the current tenant
  is_protected: boolean;
  created_at: string;
  updated_at: string;
}

export default function UserManagementPage() {
  const { profile, currentTenant, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "manager" | "user">("user");
  const [useTemporaryPassword, setUseTemporaryPassword] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<UserProfile | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);

  // Check if current user has admin access (either global or tenant-level)
  const isSuperAdmin = profile?.role === "super_admin";
  const isTenantAdmin = currentTenant?.role === "admin";
  const hasAdminAccess = isSuperAdmin || isTenantAdmin;

  useEffect(() => {
    if (!authLoading && !hasAdminAccess) {
      router.push("/unauthorized");
      return;
    }

    if (profile) {
      fetchUsers();
    }
  }, [profile, authLoading, router, hasAdminAccess]);

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/admin/users");
      if (response.ok) {
        const data = await response.json();
        setUsers(data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteUser = async () => {
    if (!inviteEmail) return;
    if (useTemporaryPassword && !temporaryPassword) return;
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          fullName: inviteName || undefined,
          role: inviteRole,
          temporaryPassword: useTemporaryPassword ? temporaryPassword : undefined,
        }),
      });
      if (response.ok) {
        setShowInviteModal(false);
        setInviteEmail("");
        setInviteName("");
        setInviteRole("user");
        setUseTemporaryPassword(false);
        setTemporaryPassword("");
        fetchUsers();
      }
    } catch (error) {
      console.error("Failed to invite user:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (response.ok) {
        fetchUsers();
        setShowEditModal(false);
        setSelectedUser(null);
      }
    } catch (error) {
      console.error("Failed to update user role:", error);
    }
  };

  const handleUpdateUser = async (user: UserProfile) => {
    try {
      // Update profile (name, email)
      const profileResponse = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: user.full_name,
          email: user.email,
        }),
      });

      if (!profileResponse.ok) {
        const errorData = await profileResponse.json().catch(() => ({}));
        alert(errorData.error || "Failed to update user profile");
        return;
      }

      // Update role
      const roleResponse = await fetch(`/api/admin/users/${user.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: user.tenant_role || user.role }),
      });

      if (!roleResponse.ok) {
        const errorData = await roleResponse.json().catch(() => ({}));
        alert(errorData.error || "Failed to update user role");
        return;
      }

      fetchUsers();
      setShowEditModal(false);
      setSelectedUser(null);
    } catch (error) {
      console.error("Failed to update user:", error);
      alert("An error occurred while updating the user");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Failed to delete user:", error);
    }
  };

  const handleImpersonate = async (user: UserProfile) => {
    const reason = prompt("Enter a reason for impersonating this user (optional):");
    setIsImpersonating(true);
    try {
      const response = await fetch("/api/admin/impersonate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          reason: reason || undefined,
        }),
      });

      if (response.ok) {
        // Redirect to dashboard as the impersonated user
        router.push("/dashboard");
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to start impersonation");
      }
    } catch (error) {
      console.error("Failed to impersonate user:", error);
      alert("An error occurred while starting impersonation");
    } finally {
      setIsImpersonating(false);
    }
  };

  // Get effective role (tenant role takes precedence for display in tenant context)
  const getEffectiveRole = (user: UserProfile) => {
    return user.tenant_role || user.role;
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "super_admin":
        return <ShieldCheck className="h-4 w-4 text-teal-600" />;
      case "admin":
        return <Shield className="h-4 w-4 text-blue-600" />;
      case "manager":
        return <ShieldAlert className="h-4 w-4 text-purple-600" />;
      default:
        return <User className="h-4 w-4 text-slate-600" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "super_admin":
        return "bg-gradient-to-r from-teal-100 to-cyan-100 text-teal-800 border border-teal-200";
      case "admin":
        return "bg-blue-100 text-blue-800 border border-blue-200";
      case "manager":
        return "bg-purple-100 text-purple-800 border border-purple-200";
      default:
        return "bg-slate-100 text-slate-700 border border-slate-200";
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/25">
            <Users className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">User Management</h1>
            <p className="text-slate-500 mt-1">Manage users and their permissions</p>
          </div>
        </div>
        <Button onClick={() => setShowInviteModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Invite User
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <Input
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gradient-to-br from-slate-50 to-gray-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredUsers.map((user) => {
              const effectiveRole = getEffectiveRole(user);
              return (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-teal-100 to-cyan-100 flex items-center justify-center shadow-sm">
                        {getRoleIcon(effectiveRole)}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800">
                          {user.full_name || "No name"}
                          {user.is_protected && (
                            <span className="ml-2 text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">(Protected)</span>
                          )}
                        </div>
                        <div className="text-sm text-slate-500 flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold capitalize ${getRoleBadgeColor(effectiveRole)}`}>
                      {effectiveRole.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-500 flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      {formatRelativeTime(user.created_at)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* Login As button - only visible to super_admin for non-super_admin users */}
                      {isSuperAdmin && effectiveRole !== "super_admin" && !user.is_protected && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleImpersonate(user)}
                          disabled={isImpersonating}
                          className="hover:bg-amber-50 hover:text-amber-600"
                          title="Login as this user"
                        >
                          <LogIn className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Permissions button - visible for all non-super_admin users */}
                      {effectiveRole !== "super_admin" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPermissionsUser(user);
                            setShowPermissionsModal(true);
                          }}
                          className="hover:bg-purple-50 hover:text-purple-600"
                          title="Manage Permissions"
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Edit button - visible to admins for non-protected users */}
                      {!user.is_protected && hasAdminAccess && effectiveRole !== "super_admin" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setShowEditModal(true);
                          }}
                          className="hover:bg-teal-50 hover:text-teal-600"
                          title="Edit Role"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Delete button - only super_admin can delete admins, admins can delete managers/users */}
                      {!user.is_protected &&
                       effectiveRole !== "super_admin" &&
                       (isSuperAdmin || (isTenantAdmin && effectiveRole !== "admin")) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteUser(user.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Delete User"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center">
                  <div className="p-4 bg-slate-100 rounded-full inline-block mb-3">
                    <Users className="h-8 w-8 text-slate-400" />
                  </div>
                  <p className="text-lg font-semibold text-slate-700">No users found</p>
                  <p className="text-slate-500 text-sm mt-1">Try adjusting your search or invite new users</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invite User Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => {
          setShowInviteModal(false);
          setInviteEmail("");
          setInviteName("");
          setInviteRole("user");
          setUseTemporaryPassword(false);
          setTemporaryPassword("");
        }}
        title="Invite User"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <Input
              type="text"
              placeholder="John Doe"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <Input
              type="email"
              placeholder="user@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "admin" | "manager" | "user")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="user">User - Basic access to permitted content</option>
              <option value="manager">Manager - Can manage users and permissions</option>
              <option value="admin">Admin - Full access, cannot be deleted by managers</option>
            </select>
          </div>
          <div className="border-t border-gray-200 pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useTemporaryPassword}
                onChange={(e) => setUseTemporaryPassword(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Set temporary password (user must change on first login)
              </span>
            </label>
            {useTemporaryPassword && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Temporary Password
                </label>
                <Input
                  type="text"
                  placeholder="Enter temporary password"
                  value={temporaryPassword}
                  onChange={(e) => setTemporaryPassword(e.target.value)}
                />
                <p className="mt-1 text-xs text-gray-500">
                  User will be required to change this password on first login.
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => {
              setShowInviteModal(false);
              setInviteEmail("");
              setInviteName("");
              setInviteRole("user");
              setUseTemporaryPassword(false);
              setTemporaryPassword("");
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleInviteUser}
              isLoading={isSubmitting}
              disabled={!inviteEmail || (useTemporaryPassword && !temporaryPassword)}
            >
              {useTemporaryPassword ? "Create User" : "Send Invitation"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedUser(null);
        }}
        title="Edit User"
      >
        {selectedUser && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <Input
                type="text"
                value={selectedUser.full_name || ""}
                onChange={(e) =>
                  setSelectedUser({ ...selectedUser, full_name: e.target.value || null })
                }
                placeholder="Enter full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <Input
                type="email"
                value={selectedUser.email}
                onChange={(e) =>
                  setSelectedUser({ ...selectedUser, email: e.target.value })
                }
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                value={selectedUser.tenant_role || selectedUser.role}
                onChange={(e) =>
                  setSelectedUser({ ...selectedUser, tenant_role: e.target.value as any })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="user">User</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
                {profile?.role === "super_admin" && (
                  <option value="super_admin">Super Admin</option>
                )}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedUser(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleUpdateUser(selectedUser)}
              >
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Permissions Modal */}
      {permissionsUser && (
        <UserPermissionsModal
          isOpen={showPermissionsModal}
          onClose={() => {
            setShowPermissionsModal(false);
            setPermissionsUser(null);
          }}
          userId={permissionsUser.id}
          userName={permissionsUser.full_name || permissionsUser.email}
          onSave={() => {
            // Could refresh users list if needed, but permissions don't affect the list
          }}
        />
      )}
    </div>
  );
}
