"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  DollarSign,
  TrendingUp,
  Users,
  AlertTriangle,
  CreditCard,
  RefreshCw,
  Building2,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";

interface BillingMetrics {
  totalMRR: string;
  totalARR: string;
  activeSubscriptions: number;
  trialSubscriptions: number;
  pastDueSubscriptions: number;
  totalTenants: number;
}

interface RevenueByPlan {
  name: string;
  count: number;
  revenue: number;
}

interface RecentActivity {
  id: string;
  action: string;
  created_at: string;
  new_values: Record<string, unknown> | null;
  user: { email: string; full_name: string | null } | null;
  tenant: { name: string } | null;
}

interface TenantBilling {
  id: string;
  name: string;
  billing_status: string;
  billing_cycle: string;
  plan_expires_at: string | null;
  plan: { id: string; name: string; price_monthly: string } | null;
}

interface BillingOverview {
  metrics: BillingMetrics;
  revenueByPlan: RevenueByPlan[];
  recentActivity: RecentActivity[];
  tenants: TenantBilling[];
}

export default function SuperAdminBillingPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && profile?.role !== "super_admin") {
      router.push("/dashboard");
      return;
    }
    if (!authLoading && profile?.role === "super_admin") {
      fetchOverview();
    }
  }, [authLoading, profile, router]);

  const fetchOverview = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/billing/overview");
      if (res.ok) {
        const data = await res.json();
        setOverview(data);
      }
    } catch (error) {
      console.error("Error fetching billing overview:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "trialing":
      case "trial":
        return "bg-blue-100 text-blue-800";
      case "past_due":
        return "bg-yellow-100 text-yellow-800";
      case "canceled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getActivityIcon = (action: string) => {
    if (action.includes("succeeded") || action.includes("created")) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (action.includes("failed") || action.includes("cancelled")) {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    return <Clock className="h-4 w-4 text-blue-500" />;
  };

  const formatAction = (action: string) => {
    return action.replace(/\./g, " ").replace(/_/g, " ");
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
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-green-100 p-3 rounded-xl">
            <DollarSign className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Revenue Overview</h1>
            <p className="text-gray-500">Platform-wide billing and subscription metrics</p>
          </div>
        </div>
        <Button onClick={fetchOverview} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Monthly Revenue (MRR)</p>
                <p className="text-3xl font-bold text-gray-900">
                  ${parseFloat(overview?.metrics.totalMRR || "0").toLocaleString()}
                </p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Annual Revenue (ARR)</p>
                <p className="text-3xl font-bold text-gray-900">
                  ${parseFloat(overview?.metrics.totalARR || "0").toLocaleString()}
                </p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Active Subscriptions</p>
                <p className="text-3xl font-bold text-gray-900">
                  {overview?.metrics.activeSubscriptions || 0}
                </p>
                {overview?.metrics.trialSubscriptions ? (
                  <p className="text-sm text-blue-600">+{overview.metrics.trialSubscriptions} trials</p>
                ) : null}
              </div>
              <div className="bg-violet-100 p-3 rounded-lg">
                <Users className="h-6 w-6 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Past Due</p>
                <p className="text-3xl font-bold text-gray-900">
                  {overview?.metrics.pastDueSubscriptions || 0}
                </p>
                {overview?.metrics.pastDueSubscriptions ? (
                  <p className="text-sm text-red-600">Requires attention</p>
                ) : (
                  <p className="text-sm text-green-600">All clear</p>
                )}
              </div>
              <div className={`${overview?.metrics.pastDueSubscriptions ? "bg-red-100" : "bg-green-100"} p-3 rounded-lg`}>
                <AlertTriangle className={`h-6 w-6 ${overview?.metrics.pastDueSubscriptions ? "text-red-600" : "text-green-600"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue by Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Revenue by Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overview?.revenueByPlan && overview.revenueByPlan.length > 0 ? (
              <div className="space-y-4">
                {overview.revenueByPlan.map((plan, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{plan.name}</p>
                      <p className="text-sm text-gray-500">{plan.count} subscriptions</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">${plan.revenue.toFixed(2)}/mo</p>
                      <p className="text-sm text-gray-500">${(plan.revenue * 12).toFixed(2)}/yr</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No active subscriptions
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Recent Billing Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overview?.recentActivity && overview.recentActivity.length > 0 ? (
              <div className="space-y-4 max-h-80 overflow-y-auto">
                {overview.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 border-b border-gray-100 pb-3 last:border-0">
                    {getActivityIcon(activity.action)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 capitalize">
                        {formatAction(activity.action)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {activity.tenant?.name || "Unknown tenant"}
                        {activity.user && ` - ${activity.user.full_name || activity.user.email}`}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(activity.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No recent billing activity
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* All Tenants Billing Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            All Tenants Billing Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Tenant</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Plan</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Cycle</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Expires</th>
                </tr>
              </thead>
              <tbody>
                {overview?.tenants.map((tenant) => (
                  <tr key={tenant.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        <span className="font-medium text-gray-900">{tenant.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {tenant.plan?.name || "No plan"}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(tenant.billing_status || "none")}`}>
                        {tenant.billing_status || "None"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 capitalize">
                      {tenant.billing_cycle || "-"}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {tenant.plan_expires_at ? (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          {new Date(tenant.plan_expires_at).toLocaleDateString()}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
                {(!overview?.tenants || overview.tenants.length === 0) && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      No tenants found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
