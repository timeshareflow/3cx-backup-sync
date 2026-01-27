import Link from "next/link";
import { Database, Menu } from "lucide-react";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-lg shadow-teal-500/25">
                <Database className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-800">3CX BackupWiz</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              <Link
                href="/#features"
                className="text-slate-600 hover:text-teal-600 transition-colors font-medium"
              >
                Features
              </Link>
              <Link
                href="/pricing"
                className="text-slate-600 hover:text-teal-600 transition-colors font-medium"
              >
                Pricing
              </Link>
              <Link
                href="/login"
                className="text-slate-600 hover:text-teal-600 transition-colors font-medium"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-xl shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 transition-all"
              >
                Get Started
              </Link>
            </div>

            <button className="md:hidden p-2 rounded-lg hover:bg-slate-100">
              <Menu className="h-6 w-6 text-slate-600" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>{children}</main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl">
                  <Database className="h-6 w-6 text-white" />
                </div>
                <span className="text-xl font-bold text-white">3CX BackupWiz</span>
              </div>
              <p className="text-slate-400 max-w-md">
                The complete backup solution for self-hosted and on-premises 3CX systems.
                Protect your business communications with enterprise-grade security.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4">Product</h3>
              <ul className="space-y-2">
                <li>
                  <Link href="/#features" className="hover:text-teal-400 transition-colors">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="hover:text-teal-400 transition-colors">
                    Pricing
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4">Account</h3>
              <ul className="space-y-2">
                <li>
                  <Link href="/login" className="hover:text-teal-400 transition-colors">
                    Sign In
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className="hover:text-teal-400 transition-colors">
                    Create Account
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 mt-12 pt-8 text-center text-sm">
            <p>&copy; {new Date().getFullYear()} 3CX BackupWiz. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
