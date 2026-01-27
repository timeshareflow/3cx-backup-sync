"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Check,
  HardDrive,
  MessageSquare,
  Shield,
  Zap,
  Users,
  Phone,
  HeadphonesIcon,
  ArrowRight,
} from "lucide-react";

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

export default function PricingPage() {
  const [plans, setPlans] = useState<StoragePlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  useEffect(() => {
    fetchPlans();
  }, []);

  async function fetchPlans() {
    try {
      const response = await fetch("/api/public/plans");
      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans || []);
      }
    } catch (error) {
      console.error("Error fetching plans:", error);
    } finally {
      setIsLoading(false);
    }
  }

  // Fallback static plans if API fails
  const staticPlans: StoragePlan[] = [
    {
      id: "free",
      name: "Free",
      description: "For small teams getting started",
      storage_limit_gb: 5,
      price_monthly: "0",
      price_yearly: "0",
      features: [
        "5 GB storage",
        "Chat backup",
        "7-day retention",
        "Email support",
      ],
      is_default: true,
    },
    {
      id: "starter",
      name: "Starter",
      description: "For growing businesses",
      storage_limit_gb: 50,
      price_monthly: "29",
      price_yearly: "290",
      features: [
        "50 GB storage",
        "All communication types",
        "30-day retention",
        "Priority support",
        "Basic search",
      ],
      is_default: false,
    },
    {
      id: "professional",
      name: "Professional",
      description: "For established companies",
      storage_limit_gb: 200,
      price_monthly: "79",
      price_yearly: "790",
      features: [
        "200 GB storage",
        "All communication types",
        "1-year retention",
        "Priority support",
        "Advanced search",
        "Export capabilities",
        "API access",
      ],
      is_default: false,
    },
    {
      id: "enterprise",
      name: "Enterprise",
      description: "For large organizations",
      storage_limit_gb: 0,
      price_monthly: "199",
      price_yearly: "1990",
      features: [
        "Unlimited storage",
        "All communication types",
        "Unlimited retention",
        "24/7 support",
        "Advanced search",
        "Export capabilities",
        "API access",
        "Custom integrations",
        "Dedicated account manager",
      ],
      is_default: false,
    },
  ];

  const displayPlans = plans.length > 0 ? plans : staticPlans;

  return (
    <div>
      {/* Hero Section */}
      <section className="py-20 text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-slate-600 mb-8">
            Choose the plan that fits your business. All plans include a 14-day free trial.
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-4 p-1.5 bg-slate-100 rounded-xl">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                billingCycle === "monthly"
                  ? "bg-white text-slate-900 shadow-md"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              className={`px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ${
                billingCycle === "yearly"
                  ? "bg-white text-slate-900 shadow-md"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Yearly
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                Save 17%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {displayPlans.map((plan, index) => {
                const price =
                  billingCycle === "yearly" && plan.price_yearly
                    ? parseFloat(plan.price_yearly) / 12
                    : parseFloat(plan.price_monthly);
                const isPopular = index === 2; // Professional plan

                return (
                  <div
                    key={plan.id}
                    className={`relative p-6 rounded-2xl border-2 transition-all ${
                      isPopular
                        ? "border-teal-400 bg-gradient-to-br from-teal-50 to-cyan-50 shadow-xl shadow-teal-500/20"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg"
                    }`}
                  >
                    {isPopular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-bold rounded-full shadow-lg">
                        Most Popular
                      </div>
                    )}

                    <h3 className="text-xl font-bold text-slate-900 mb-2">{plan.name}</h3>
                    <p className="text-slate-600 text-sm mb-4">{plan.description}</p>

                    <div className="mb-6">
                      <span className="text-4xl font-bold text-slate-900">
                        ${price.toFixed(0)}
                      </span>
                      <span className="text-slate-500">/month</span>
                      {billingCycle === "yearly" && plan.price_yearly && parseFloat(plan.price_yearly) > 0 && (
                        <p className="text-sm text-slate-400 mt-1">
                          Billed annually (${parseFloat(plan.price_yearly).toFixed(0)}/year)
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mb-6 text-slate-600">
                      <HardDrive className="h-4 w-4" />
                      <span className="font-medium">
                        {plan.storage_limit_gb === 0 ? "Unlimited" : `${plan.storage_limit_gb} GB`} Storage
                      </span>
                    </div>

                    <ul className="space-y-3 mb-6">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-slate-600 text-sm">
                          <Check className="h-4 w-4 text-teal-500 mt-0.5 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    <Link
                      href="/signup"
                      className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
                        isPopular
                          ? "bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50"
                          : parseFloat(plan.price_monthly) === 0
                          ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          : "bg-slate-900 text-white hover:bg-slate-800"
                      }`}
                    >
                      {parseFloat(plan.price_monthly) === 0 ? "Start Free" : "Get Started"}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Features Comparison */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-4 text-center">
            All Plans Include
          </h2>
          <p className="text-lg text-slate-600 mb-12 text-center max-w-2xl mx-auto">
            Every plan comes with these essential features to protect your 3CX data
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: MessageSquare,
                title: "Chat Backup",
                description: "All internal and external chat conversations",
              },
              {
                icon: Phone,
                title: "Call Logs",
                description: "Complete call history with metadata",
              },
              {
                icon: Shield,
                title: "Encryption",
                description: "AES-256 encryption at rest and in transit",
              },
              {
                icon: Zap,
                title: "Real-time Sync",
                description: "Automatic backup as data is created",
              },
              {
                icon: Users,
                title: "Multi-user Access",
                description: "Role-based permissions for your team",
              },
              {
                icon: HeadphonesIcon,
                title: "Support",
                description: "Email support for all customers",
              },
            ].map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="flex items-start gap-4 p-4 bg-white rounded-xl border border-slate-200"
                >
                  <div className="p-2 bg-teal-100 rounded-lg">
                    <Icon className="h-5 w-5 text-teal-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{feature.title}</h3>
                    <p className="text-sm text-slate-600">{feature.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">
            Frequently Asked Questions
          </h2>

          <div className="space-y-6">
            {[
              {
                question: "How does the free trial work?",
                answer:
                  "All paid plans include a 14-day free trial with full features. No credit card required to start. You can upgrade or cancel anytime during the trial.",
              },
              {
                question: "Can I change plans later?",
                answer:
                  "Yes, you can upgrade or downgrade your plan at any time. When upgrading, you'll be prorated for the remaining billing period. When downgrading, the change takes effect at your next billing date.",
              },
              {
                question: "What happens if I exceed my storage limit?",
                answer:
                  "We'll notify you when you're approaching your limit. You can upgrade your plan or purchase additional storage. We won't delete your data, but new backups will be paused until you have available space.",
              },
              {
                question: "Is my data secure?",
                answer:
                  "Absolutely. All data is encrypted with AES-256 encryption both at rest and in transit. We use secure SSH connections to your 3CX server and never store your passwords in plain text.",
              },
              {
                question: "Do you support self-hosted 3CX?",
                answer:
                  "Yes! 3CX BackupWiz is specifically designed for self-hosted and on-premises 3CX installations. We connect directly to your PostgreSQL database via SSH tunnel.",
              },
            ].map((faq, i) => (
              <div key={i} className="p-6 bg-white rounded-2xl border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-800 mb-2">{faq.question}</h3>
                <p className="text-slate-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            Ready to Protect Your 3CX Data?
          </h2>
          <p className="text-lg text-slate-300 mb-8">
            Start your free trial today. No credit card required.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-xl shadow-xl shadow-teal-500/30 hover:shadow-teal-500/50 transition-all text-lg"
          >
            Get Started Free
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
