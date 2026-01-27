"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Building2, User, Mail, Phone, MapPin, Lock } from "lucide-react";

type CustomerType = "standard" | "business";

interface FormData {
  customerType: CustomerType;
  // Standard user fields
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  // Business fields
  businessName: string;
  contactName: string;
  billingEmail: string;
  businessPhone: string;
  businessAddress: string;
  // Auth
  password: string;
  confirmPassword: string;
}

const defaultFormData: FormData = {
  customerType: "standard",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  businessName: "",
  contactName: "",
  billingEmail: "",
  businessPhone: "",
  businessAddress: "",
  password: "",
  confirmPassword: "",
};

export default function SignupPage() {
  const [formData, setFormData] = useState<FormData>(defaultFormData);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const updateFormData = (field: keyof FormData, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  const validateForm = (): string | null => {
    if (formData.password !== formData.confirmPassword) {
      return "Passwords do not match";
    }

    if (formData.password.length < 8) {
      return "Password must be at least 8 characters";
    }

    if (formData.customerType === "standard") {
      if (!formData.firstName.trim()) return "First name is required";
      if (!formData.lastName.trim()) return "Last name is required";
      if (!formData.email.trim()) return "Email is required";
      if (!formData.phone.trim()) return "Phone number is required";
      if (!formData.address.trim()) return "Address is required";
    } else {
      if (!formData.businessName.trim()) return "Business name is required";
      if (!formData.contactName.trim()) return "Contact name is required";
      if (!formData.billingEmail.trim()) return "Billing email is required";
      if (!formData.businessPhone.trim()) return "Business phone is required";
      if (!formData.businessAddress.trim()) return "Business address is required";
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      setIsLoading(false);
      return;
    }

    try {
      const supabase = createClient();

      // Determine email based on customer type
      const signupEmail = formData.customerType === "business"
        ? formData.billingEmail
        : formData.email;

      // Build user metadata
      const metadata: Record<string, string> = {
        customer_type: formData.customerType,
      };

      if (formData.customerType === "standard") {
        metadata.first_name = formData.firstName;
        metadata.last_name = formData.lastName;
        metadata.full_name = `${formData.firstName} ${formData.lastName}`;
        metadata.phone = formData.phone;
        metadata.address = formData.address;
      } else {
        metadata.business_name = formData.businessName;
        metadata.contact_name = formData.contactName;
        metadata.full_name = formData.contactName;
        metadata.billing_email = formData.billingEmail;
        metadata.business_phone = formData.businessPhone;
        metadata.business_address = formData.businessAddress;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email: signupEmail,
        password: formData.password,
        options: {
          data: metadata,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="bg-green-50 border border-green-200 text-green-700 px-6 py-8 rounded-2xl shadow-lg">
            <h2 className="text-xl font-semibold mb-2">Check your email</h2>
            <p>
              We&apos;ve sent you a confirmation link. Please check your email to verify your account.
            </p>
            <Link
              href="/login"
              className="inline-block mt-4 text-blue-600 hover:text-blue-500 font-medium"
            >
              Return to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-800">
            3CX BackupWiz
          </h1>
          <h2 className="mt-2 text-xl text-slate-600">
            Create your account
          </h2>
        </div>

        <form className="mt-8 space-y-6 bg-white p-8 rounded-2xl shadow-xl border border-slate-200" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Customer Type Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Account Type
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => updateFormData("customerType", "standard")}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  formData.customerType === "standard"
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
                onClick={() => updateFormData("customerType", "business")}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  formData.customerType === "business"
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

          {/* Standard User Fields */}
          {formData.customerType === "standard" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-slate-700 mb-1">
                    First Name *
                  </label>
                  <Input
                    id="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => updateFormData("firstName", e.target.value)}
                    placeholder="John"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-slate-700 mb-1">
                    Last Name *
                  </label>
                  <Input
                    id="lastName"
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => updateFormData("lastName", e.target.value)}
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => updateFormData("email", e.target.value)}
                    placeholder="john@example.com"
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">
                  Phone Number *
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    id="phone"
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => updateFormData("phone", e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="address" className="block text-sm font-medium text-slate-700 mb-1">
                  Address *
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <textarea
                    id="address"
                    required
                    value={formData.address}
                    onChange={(e) => updateFormData("address", e.target.value)}
                    placeholder="123 Main St, City, State 12345"
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 min-h-[80px] resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Business Fields */}
          {formData.customerType === "business" && (
            <div className="space-y-4">
              <div>
                <label htmlFor="businessName" className="block text-sm font-medium text-slate-700 mb-1">
                  Business Name *
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    id="businessName"
                    type="text"
                    required
                    value={formData.businessName}
                    onChange={(e) => updateFormData("businessName", e.target.value)}
                    placeholder="Acme Corporation"
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="contactName" className="block text-sm font-medium text-slate-700 mb-1">
                  Contact Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    id="contactName"
                    type="text"
                    required
                    value={formData.contactName}
                    onChange={(e) => updateFormData("contactName", e.target.value)}
                    placeholder="John Doe"
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="billingEmail" className="block text-sm font-medium text-slate-700 mb-1">
                  Billing Email *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    id="billingEmail"
                    type="email"
                    required
                    value={formData.billingEmail}
                    onChange={(e) => updateFormData("billingEmail", e.target.value)}
                    placeholder="billing@company.com"
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">Used for login and billing notifications</p>
              </div>

              <div>
                <label htmlFor="businessPhone" className="block text-sm font-medium text-slate-700 mb-1">
                  Business Phone *
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    id="businessPhone"
                    type="tel"
                    required
                    value={formData.businessPhone}
                    onChange={(e) => updateFormData("businessPhone", e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="businessAddress" className="block text-sm font-medium text-slate-700 mb-1">
                  Business Address *
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                  <textarea
                    id="businessAddress"
                    required
                    value={formData.businessAddress}
                    onChange={(e) => updateFormData("businessAddress", e.target.value)}
                    placeholder="123 Business Ave, Suite 100, City, State 12345"
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 min-h-[80px] resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Password Section */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <div className="flex items-center gap-2 text-slate-600">
              <Lock className="h-5 w-5" />
              <span className="font-medium">Set Your Password</span>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                Password *
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={formData.password}
                onChange={(e) => updateFormData("password", e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
                Confirm Password *
              </label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={formData.confirmPassword}
                onChange={(e) => updateFormData("confirmPassword", e.target.value)}
                placeholder="Confirm your password"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            isLoading={isLoading}
          >
            Create Account
          </Button>

          <p className="text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 hover:text-blue-500 font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
