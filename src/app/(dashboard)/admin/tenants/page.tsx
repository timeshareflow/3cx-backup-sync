"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import {
  Building2,
  Plus,
  Search,
  Edit,
  Trash2,
  Users,
  MessageSquare,
  Server,
  Mail,
  User,
  AlertCircle,
  CreditCard,
  Package,
  DollarSign,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/date";

interface StoragePlan {
  id: string;
  name: string;
  description: string | null;
  storage_limit_gb: number;
  price_monthly: string;
  price_yearly: string | null;
  features: string[];
  is_default: boolean;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  threecx_host: string | null;
  threecx_port: number | null;
  threecx_database: string | null;
  is_active: boolean;
  created_at: string;
  user_count?: number;
  conversation_count?: number;
  storage_plan_id: string | null;
  price_override: string | null;
  billing_email: string | null;
  billing_status: string | null;
  storage_plan?: StoragePlan | null;
}

type CustomerType = "standard" | "business";

interface CreateTenantFormData {
  customerType: CustomerType;
  name: string;
  slug: string;
  // Standard user fields
  admin_first_name: string;
  admin_last_name: string;
  admin_email: string;
  admin_phone: string;
  admin_address: string;
  admin_password: string;
  // Business fields
  business_name: string;
  contact_name: string;
  billing_email: string;
  business_phone: string;
  business_address: string;
}

interface EditTenantFormData {
  name: string;
  is_active: boolean;
  storage_plan_id: string;
  price_override: string;
  billing_email: string;
}

const defaultCreateFormData: CreateTenantFormData = {
  customerType: "standard",
  name: "",
  slug: "",
  admin_first_name: "",
  admin_last_name: "",
  admin_email: "",
  admin_phone: "",
  admin_address: "",
  admin_password: "",
  business_name: "",
  contact_name: "",
  billing_email: "",
  business_phone: "",
  business_address: "",
};

const defaultEditFormData: EditTenantFormData = {
  name: "",
  is_active: true,
  storage_plan_id: "",
  price_override: "",
  billing_email: "",
};

export default function TenantManagementPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [storagePlans, setStoragePlans] = useState<StoragePlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [createFormData, setCreateFormData] = useState<CreateTenantFormData>(defaultCreateFormData);
  const [editFormData, setEditFormData] = useState<EditTenantFormData>(defaultEditFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for auth to finish loading and profile to be fetched
    if (authLoading) return;

    // If profile is still null after auth loading, wait for it
    if (!profile) return;

    if (profile.role !== "super_admin") {
      router.push("/unauthorized");
      return;
    }

    fetchTenants();
    fetchStoragePlans();
  }, [profile, authLoading, router]);

  const fetchTenants = async () => {
    try {
      const response = await fetch("/api/admin/tenants");
      if (response.ok) {
        const data = await response.json();
        setTenants(data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch tenants:", error);
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

  const handleCreateTenant = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createFormData),
      });
      if (response.ok) {
        setShowCreateModal(false);
        setCreateFormData(defaultCreateFormData);
        fetchTenants();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to create tenant");
      }
    } catch (error) {
      console.error("Failed to create tenant:", error);
      setError("Failed to create tenant");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTenant = async () => {
    if (!selectedTenant) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/tenants/${selectedTenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFormData),
      });
      if (response.ok) {
        setShowEditModal(false);
        setSelectedTenant(null);
        setEditFormData(defaultEditFormData);
        fetchTenants();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to update tenant");
      }
    } catch (error) {
      console.error("Failed to update tenant:", error);
      setError("Failed to update tenant");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTenant = async (tenantId: string) => {
    if (!confirm("Are you sure you want to delete this tenant? This will delete all associated data.")) return;
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        fetchTenants();
      }
    } catch (error) {
      console.error("Failed to delete tenant:", error);
    }
  };

  const handleEditTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setEditFormData({
      name: tenant.name,
      is_active: tenant.is_active,
      storage_plan_id: tenant.storage_plan_id || "",
      price_override: tenant.price_override || "",
      billing_email: tenant.billing_email || "",
    });
    setShowEditModal(true);
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const filteredTenants = tenants.filter(
    (tenant) =>
      tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tenant.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl shadow-lg shadow-teal-500/25">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Tenant Management</h1>
            <p className="text-slate-500 mt-1">Create and manage tenant organizations</p>
          </div>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Tenant
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <Input
          placeholder="Search tenants..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tenants Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTenants.map((tenant) => (
          <div
            key={tenant.id}
            className={`bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-5 transition-all hover:shadow-xl ${!tenant.is_active ? "opacity-60" : ""}`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-teal-100 to-cyan-100 rounded-xl">
                  <Building2 className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{tenant.name}</h3>
                  <p className="text-sm text-slate-500">{tenant.slug}</p>
                </div>
              </div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                tenant.is_active
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}>
                {tenant.is_active ? "Active" : "Inactive"}
              </span>
            </div>

            <div className="space-y-3 text-sm">
              {tenant.threecx_host ? (
                <div className="flex items-center gap-2 text-slate-600 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200">
                  <Server className="h-4 w-4 text-emerald-500" />
                  <span className="font-mono text-xs">{tenant.threecx_host}:{tenant.threecx_port}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-xs font-medium">3CX not configured</span>
                </div>
              )}

              {/* Plan & Billing Info */}
              <div className="flex items-center gap-2 text-slate-600 bg-violet-50 px-3 py-2 rounded-lg border border-violet-200">
                <Package className="h-4 w-4 text-violet-500" />
                <span className="text-xs">
                  {tenant.storage_plan?.name || "No plan"}
                  {tenant.price_override && (
                    <span className="ml-1 text-violet-600 font-medium">(${tenant.price_override}/mo)</span>
                  )}
                </span>
                {tenant.billing_status && (
                  <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
                    tenant.billing_status === "active" ? "bg-green-100 text-green-700" :
                    tenant.billing_status === "past_due" ? "bg-red-100 text-red-700" :
                    tenant.billing_status === "trial" ? "bg-blue-100 text-blue-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>
                    {tenant.billing_status}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 text-slate-500">
                <span className="flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-lg">
                  <Users className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold text-blue-700">{tenant.user_count || 0}</span> users
                </span>
                <span className="flex items-center gap-1.5 bg-teal-50 px-3 py-1.5 rounded-lg">
                  <MessageSquare className="h-4 w-4 text-teal-500" />
                  <span className="font-semibold text-teal-700">{tenant.conversation_count || 0}</span> chats
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
              <span className="text-xs text-slate-400">
                Created {formatRelativeTime(tenant.created_at)}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEditTenant(tenant)}
                  className="hover:bg-teal-50 hover:text-teal-600"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteTenant(tenant.id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        {filteredTenants.length === 0 && (
          <div className="col-span-full bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-12 text-center">
            <div className="p-4 bg-slate-100 rounded-full inline-block mb-4">
              <Building2 className="h-12 w-12 text-slate-400" />
            </div>
            <p className="text-xl font-bold text-slate-800">No tenants found</p>
            <p className="text-slate-500 mt-1">Create a new tenant to get started</p>
          </div>
        )}
      </div>

      {/* Create Tenant Modal with Customer Type Selection */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCreateFormData(defaultCreateFormData);
          setError(null);
        }}
        title="Create New Tenant"
      >
        <div className="space-y-5 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-slate-600 bg-teal-50 border border-teal-200 rounded-xl p-4">
            Create a new tenant organization. The tenant admin will be able to configure their own 3CX connection settings after logging in.
          </p>

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Customer Type Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Customer Type *
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setCreateFormData({ ...createFormData, customerType: "standard" })}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  createFormData.customerType === "standard"
                    ? "border-teal-500 bg-teal-50 text-teal-700"
                    : "border-slate-200 hover:border-slate-300 text-slate-600"
                }`}
              >
                <User className="h-6 w-6" />
                <span className="font-medium">Standard</span>
                <span className="text-xs text-slate-500">Individual user</span>
              </button>
              <button
                type="button"
                onClick={() => setCreateFormData({ ...createFormData, customerType: "business" })}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  createFormData.customerType === "business"
                    ? "border-violet-500 bg-violet-50 text-violet-700"
                    : "border-slate-200 hover:border-slate-300 text-slate-600"
                }`}
              >
                <Building2 className="h-6 w-6" />
                <span className="font-medium">Business</span>
                <span className="text-xs text-slate-500">Organization</span>
              </button>
            </div>
          </div>

          {/* Organization Details */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
              <div className="p-2 bg-teal-100 rounded-lg">
                <Building2 className="h-5 w-5 text-teal-600" />
              </div>
              <h4 className="font-semibold text-slate-800">Organization Details</h4>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Organization Name *
                </label>
                <Input
                  placeholder="Acme Corporation"
                  value={createFormData.name}
                  onChange={(e) => {
                    setCreateFormData({
                      ...createFormData,
                      name: e.target.value,
                      slug: generateSlug(e.target.value),
                    });
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Slug (URL identifier) *
                </label>
                <Input
                  placeholder="acme-corporation"
                  value={createFormData.slug}
                  onChange={(e) => setCreateFormData({ ...createFormData, slug: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Standard User Fields */}
          {createFormData.customerType === "standard" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <h4 className="font-semibold text-slate-800">Admin Details</h4>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    First Name *
                  </label>
                  <Input
                    placeholder="John"
                    value={createFormData.admin_first_name}
                    onChange={(e) => setCreateFormData({ ...createFormData, admin_first_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Last Name *
                  </label>
                  <Input
                    placeholder="Smith"
                    value={createFormData.admin_last_name}
                    onChange={(e) => setCreateFormData({ ...createFormData, admin_last_name: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="admin@example.com"
                    value={createFormData.admin_email}
                    onChange={(e) => setCreateFormData({ ...createFormData, admin_email: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Phone Number *
                </label>
                <Input
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={createFormData.admin_phone}
                  onChange={(e) => setCreateFormData({ ...createFormData, admin_phone: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Address *
                </label>
                <textarea
                  placeholder="123 Main St, City, State 12345"
                  value={createFormData.admin_address}
                  onChange={(e) => setCreateFormData({ ...createFormData, admin_address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 min-h-[60px] resize-none"
                />
              </div>
            </div>
          )}

          {/* Business Fields */}
          {createFormData.customerType === "business" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
                <div className="p-2 bg-violet-100 rounded-lg">
                  <Building2 className="h-5 w-5 text-violet-600" />
                </div>
                <h4 className="font-semibold text-slate-800">Business Details</h4>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Business Name *
                </label>
                <Input
                  placeholder="Acme Corporation"
                  value={createFormData.business_name}
                  onChange={(e) => setCreateFormData({ ...createFormData, business_name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Contact Name *
                </label>
                <Input
                  placeholder="John Smith"
                  value={createFormData.contact_name}
                  onChange={(e) => setCreateFormData({ ...createFormData, contact_name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Billing Email *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="billing@company.com"
                    value={createFormData.billing_email}
                    onChange={(e) => setCreateFormData({ ...createFormData, billing_email: e.target.value })}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">Used for login and billing notifications</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Business Phone *
                </label>
                <Input
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={createFormData.business_phone}
                  onChange={(e) => setCreateFormData({ ...createFormData, business_phone: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Business Address *
                </label>
                <textarea
                  placeholder="123 Business Ave, Suite 100, City, State 12345"
                  value={createFormData.business_address}
                  onChange={(e) => setCreateFormData({ ...createFormData, business_address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 min-h-[60px] resize-none"
                />
              </div>
            </div>
          )}

          {/* Password Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Server className="h-5 w-5 text-amber-600" />
              </div>
              <h4 className="font-semibold text-slate-800">Account Password</h4>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Password *
              </label>
              <Input
                type="password"
                placeholder="Create a secure password"
                value={createFormData.admin_password}
                onChange={(e) => setCreateFormData({ ...createFormData, admin_password: e.target.value })}
              />
              <p className="text-xs text-slate-500 mt-1">Minimum 8 characters</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setCreateFormData(defaultCreateFormData);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTenant}
              isLoading={isSubmitting}
              disabled={
                !createFormData.name ||
                !createFormData.admin_password ||
                (createFormData.customerType === "standard"
                  ? !createFormData.admin_first_name || !createFormData.admin_last_name || !createFormData.admin_email || !createFormData.admin_phone || !createFormData.admin_address
                  : !createFormData.business_name || !createFormData.contact_name || !createFormData.billing_email || !createFormData.business_phone || !createFormData.business_address
                )
              }
            >
              Create Tenant
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Tenant Modal - Simple edit for name and status */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedTenant(null);
          setEditFormData(defaultEditFormData);
          setError(null);
        }}
        title="Edit Tenant"
      >
        {selectedTenant && (
          <div className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-100 rounded-lg">
                  <Building2 className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{selectedTenant.name}</p>
                  <p className="text-sm text-slate-500">{selectedTenant.slug}</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Organization Name
              </label>
              <Input
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              />
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editFormData.is_active}
                  onChange={(e) => setEditFormData({ ...editFormData, is_active: e.target.checked })}
                  className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <span className="font-medium text-slate-800">Tenant is active</span>
                  <p className="text-sm text-slate-500">Inactive tenants cannot access the system</p>
                </div>
              </label>
            </div>

            {/* Billing & Plan Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
                <div className="p-2 bg-violet-100 rounded-lg">
                  <CreditCard className="h-5 w-5 text-violet-600" />
                </div>
                <h4 className="font-semibold text-slate-800">Billing & Plan</h4>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Storage Plan
                </label>
                <select
                  value={editFormData.storage_plan_id}
                  onChange={(e) => setEditFormData({ ...editFormData, storage_plan_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">No plan assigned</option>
                  {storagePlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - ${parseFloat(plan.price_monthly).toFixed(2)}/mo ({plan.storage_limit_gb === 0 ? "Unlimited" : `${plan.storage_limit_gb}GB`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Price Override (Monthly)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Leave empty to use plan price"
                    value={editFormData.price_override}
                    onChange={(e) => setEditFormData({ ...editFormData, price_override: e.target.value })}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Override the plan&apos;s monthly price for this tenant
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Billing Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="billing@company.com"
                    value={editFormData.billing_email}
                    onChange={(e) => setEditFormData({ ...editFormData, billing_email: e.target.value })}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Email address for billing notifications
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedTenant(null);
                  setEditFormData(defaultEditFormData);
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdateTenant} isLoading={isSubmitting}>
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
