"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();

      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setIsLoading(false);
        return;
      }

      if (!authData.user) {
        setError("No user returned from authentication");
        setIsLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();

      if (profile?.role === "super_admin") {
        router.push("/admin/super");
      } else {
        router.push("/");
      }

      router.refresh();
    } catch (err) {
      console.error("Login error:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 p-12 flex-col justify-between relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-teal-500/20 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -left-20 w-60 h-60 bg-cyan-500/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 right-20 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/30">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="text-white text-2xl font-bold">3CX BackupWiz</span>
          </div>
        </div>

        <div className="space-y-6 relative">
          <h1 className="text-5xl font-bold text-white leading-tight">
            Complete 3CX Backup
            <br />
            <span className="bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">for Your Business</span>
          </h1>
          <p className="text-slate-300 text-lg max-w-md">
            Backup and archive chats, call recordings, voicemails, faxes, and call logs from your 3CX system with enterprise-grade security.
          </p>
          <p className="text-teal-400 text-sm font-medium">
            For self-hosted and on-premises 3CX instances
          </p>

          <div className="flex gap-8 pt-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-white">100%</div>
              <div className="text-teal-400 text-sm mt-1 font-medium">Secure</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white">Real-time</div>
              <div className="text-teal-400 text-sm mt-1 font-medium">Sync</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white">Multi</div>
              <div className="text-teal-400 text-sm mt-1 font-medium">Tenant</div>
            </div>
          </div>
        </div>

        <div className="text-slate-400 text-sm relative">
          © {new Date().getFullYear()} 3CX BackupWiz. All rights reserved.
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/30">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="text-white text-2xl font-bold">3CX BackupWiz</span>
          </div>

          <div className="bg-white rounded-3xl shadow-2xl p-8 relative overflow-hidden">
            {/* Card decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-teal-500/5 to-transparent rounded-full -mr-16 -mt-16" />

            <div className="text-center mb-8 relative">
              <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
              <p className="text-gray-500 mt-2">Sign in to your account to continue</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 relative">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                  <span className="text-sm text-gray-600">Remember me</span>
                </label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-teal-600 hover:text-teal-700 font-semibold"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-teal-500/30 hover:shadow-teal-500/40"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            <div className="mt-6 text-center relative">
              <p className="text-gray-500 text-sm">
                Don&apos;t have an account?{" "}
                <Link href="/signup" className="text-teal-600 hover:text-teal-700 font-semibold">
                  Sign up
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-slate-400 text-xs mt-6">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
