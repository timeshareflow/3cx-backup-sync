"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  CreditCard,
  HardDrive,
  Package,
  Check,
  AlertTriangle,
  ExternalLink,
  TrendingUp,
} from "lucide-react";

interface StoragePlan {
  id: string;
  name: string;
  description: string | null;
  storage_limit_gb: number;
  price_monthly: string;
  price_yearly: string | null;
  features: string[];
}

interface BillingStatus {
  tenant_id: string;
  tenant_name: string;
  billing_status: string;
  billing_cycle: string;
  has_stripe_account: boolean;
  has_subscription: boolean;
  trial_ends_at: string | null;
  storage: {
    used_bytes: number;
    used_formatted: string;
    limit_bytes: number;
    limit_formatted: string;
    percentage: number;
    is_over_limit: boolean;
    is_near_limit: boolean;
    last_calculated: string | null;
  };
  plan: StoragePlan | null;
}

// Separate component that uses useSearchParams
function BillingMessages() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");

  return (
    <>
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
          <Check className="h-5 w-5 text-green-600" />
          <span className="text-green-800">Payment successful! Your plan has been updated.</span>
        </div>
      )}
      {canceled && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <span className="text-amber-800">Checkout was canceled. No changes were made.</span>
        </div>
      )}
    </>
  );
}

export default function BillingPage() {
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [availablePlans, setAvailablePlans] = useState<StoragePlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [statusRes, plansRes] = await Promise.all([
        fetch("/api/billing/status"),
        fetch("/api/admin/storage-plans"),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setBillingStatus(data);
      }

      if (plansRes.ok) {
        const data = await plansRes.json();
        setAvailablePlans(data.plans || []);
      }
    } catch (error) {
      console.error("Error fetching billing data:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCheckout(planId: string, billingCycle: "monthly" | "yearly") {
    setCheckoutLoading(`${planId}-${billingCycle}`);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, billing_cycle: billingCycle }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to start checkout");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to start checkout");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleOpenPortal() {
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to open billing portal");
      }
    } catch (error) {
      console.error("Portal error:", error);
      alert("Failed to open billing portal");
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl shadow-lg shadow-violet-500/25">
          <CreditCard className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Billing & Subscription</h1>
          <p className="text-slate-500 mt-1">Manage your plan and payment settings</p>
        </div>
      </div>

      {/* Success/Cancel Messages */}
      <Suspense fallback={null}>
        <BillingMessages />
      </Suspense>

      {/* Current Plan & Storage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-lg">
                <Package className="h-5 w-5 text-violet-600" />
              </div>
              Current Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            {billingStatus?.plan ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">{billingStatus.plan.name}</h3>
                    <p className="text-gray-500">{billingStatus.plan.description}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-bold text-gray-900">
                      ${parseFloat(billingStatus.plan.price_monthly).toFixed(0)}
                    </span>
                    <span className="text-gray-500">/month</span>
                  </div>
                </div>

                <div className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                  billingStatus.billing_status === "active"
                    ? "bg-green-100 text-green-700"
                    : billingStatus.billing_status === "trial"
                    ? "bg-blue-100 text-blue-700"
                    : billingStatus.billing_status === "past_due"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700"
                }`}>
                  {billingStatus.billing_status === "active" ? "Active" :
                   billingStatus.billing_status === "trial" ? "Trial" :
                   billingStatus.billing_status === "past_due" ? "Past Due" :
                   billingStatus.billing_status}
                </div>

                <ul className="space-y-2 pt-4 border-t border-gray-100">
                  {(billingStatus.plan.features || []).map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-600">
                      <Check className="h-4 w-4 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {billingStatus.has_subscription && (
                  <Button variant="outline" onClick={handleOpenPortal} className="w-full mt-4">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Manage Subscription
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-600">No plan selected</p>
                <p className="text-sm text-gray-400">Choose a plan below to get started</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Storage Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <HardDrive className="h-5 w-5 text-amber-600" />
              </div>
              Storage Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-3xl font-bold text-gray-900">
                    {billingStatus?.storage.used_formatted || "0 B"}
                  </span>
                  <span className="text-gray-500 ml-2">
                    of {billingStatus?.storage.limit_formatted || "0"}
                  </span>
                </div>
                {billingStatus?.storage.is_near_limit && !billingStatus?.storage.is_over_limit && (
                  <span className="px-3 py-1 bg-amber-100 text-amber-700 text-sm font-medium rounded-full">
                    {billingStatus.storage.percentage}% used
                  </span>
                )}
                {billingStatus?.storage.is_over_limit && (
                  <span className="px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full">
                    Over limit!
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    billingStatus?.storage.is_over_limit
                      ? "bg-red-500"
                      : billingStatus?.storage.is_near_limit
                      ? "bg-amber-500"
                      : "bg-teal-500"
                  }`}
                  style={{ width: `${Math.min(billingStatus?.storage.percentage || 0, 100)}%` }}
                />
              </div>

              {billingStatus?.storage.is_near_limit && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <TrendingUp className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800">Running low on storage</p>
                      <p className="text-sm text-amber-600 mt-1">
                        Consider upgrading your plan to get more storage space.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {billingStatus?.storage.last_calculated && (
                <p className="text-xs text-gray-400">
                  Last calculated: {new Date(billingStatus.storage.last_calculated).toLocaleString()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Available Plans */}
      <Card>
        <CardHeader>
          <CardTitle>Available Plans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {availablePlans.map((plan) => {
              const isCurrent = billingStatus?.plan?.id === plan.id;
              const price = parseFloat(plan.price_monthly);
              const yearlyPrice = plan.price_yearly ? parseFloat(plan.price_yearly) : null;

              return (
                <div
                  key={plan.id}
                  className={`relative p-6 rounded-2xl border-2 ${
                    isCurrent
                      ? "border-violet-400 bg-gradient-to-br from-violet-50 to-purple-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  {isCurrent && (
                    <div className="absolute -top-3 left-4 px-3 py-1 bg-violet-500 text-white text-xs font-medium rounded-full">
                      Current Plan
                    </div>
                  )}

                  <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <p className="text-gray-500 text-sm mb-4">{plan.description}</p>

                  <div className="mb-4">
                    <span className="text-3xl font-bold text-gray-900">${price.toFixed(0)}</span>
                    <span className="text-gray-500">/month</span>
                    {yearlyPrice && yearlyPrice > 0 && (
                      <p className="text-sm text-gray-400">
                        or ${yearlyPrice.toFixed(0)}/year (save {Math.round((1 - yearlyPrice / (price * 12)) * 100)}%)
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-4 text-sm text-gray-600">
                    <HardDrive className="h-4 w-4" />
                    {plan.storage_limit_gb === 0 ? "Unlimited" : `${plan.storage_limit_gb} GB`} Storage
                  </div>

                  <ul className="space-y-2 mb-6 text-sm">
                    {(plan.features || []).slice(0, 4).map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-gray-600">
                        <Check className="h-4 w-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {!isCurrent && price > 0 && (
                    <div className="space-y-2">
                      <Button
                        onClick={() => handleCheckout(plan.id, "monthly")}
                        disabled={checkoutLoading === `${plan.id}-monthly`}
                        className="w-full"
                      >
                        {checkoutLoading === `${plan.id}-monthly` ? "Loading..." : "Subscribe Monthly"}
                      </Button>
                      {yearlyPrice && yearlyPrice > 0 && (
                        <Button
                          variant="outline"
                          onClick={() => handleCheckout(plan.id, "yearly")}
                          disabled={checkoutLoading === `${plan.id}-yearly`}
                          className="w-full"
                        >
                          {checkoutLoading === `${plan.id}-yearly` ? "Loading..." : "Subscribe Yearly"}
                        </Button>
                      )}
                    </div>
                  )}

                  {isCurrent && (
                    <div className="text-center text-sm text-violet-600 font-medium">
                      Your current plan
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
