import Link from "next/link";
import {
  MessageSquare,
  Shield,
  Zap,
  Database,
  Search,
  Phone,
  FileText,
  Mic,
  Clock,
  CheckCircle,
  ArrowRight,
  Users,
  Cloud,
  Lock,
  RefreshCw,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 lg:py-32">
        {/* Background decorations */}
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-teal-100/50 to-cyan-100/30 rounded-full -mr-96 -mt-96 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-violet-100/50 to-purple-100/30 rounded-full -ml-72 -mb-72 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-teal-50 border border-teal-200 rounded-full text-teal-700 font-medium text-sm mb-8">
              <Shield className="h-4 w-4" />
              Enterprise-grade backup for 3CX
            </div>

            <h1 className="text-5xl lg:text-7xl font-bold text-slate-900 mb-6 leading-tight">
              Complete Backup for Your{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-cyan-600">
                3CX System
              </span>
            </h1>

            <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
              Never lose a message, recording, or voicemail again. 3CX BackupWiz provides
              automated, secure backups for your self-hosted and on-premises 3CX systems.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="px-8 py-4 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-xl shadow-xl shadow-teal-500/30 hover:shadow-teal-500/50 transition-all text-lg flex items-center gap-2"
              >
                Start Free Trial
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/pricing"
                className="px-8 py-4 bg-white text-slate-700 font-semibold rounded-xl border-2 border-slate-200 hover:border-slate-300 transition-all text-lg"
              >
                View Pricing
              </Link>
            </div>

            <p className="text-sm text-slate-500 mt-6">
              No credit card required. Free trial includes full features.
            </p>
          </div>
        </div>
      </section>

      {/* What We Backup Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
              Everything You Need to Backup
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Comprehensive backup coverage for all your 3CX communication data
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: MessageSquare,
                title: "Chat Messages",
                description: "All internal and external chat conversations with full history",
                color: "teal",
              },
              {
                icon: Phone,
                title: "Call Logs",
                description: "Complete call records including duration, participants, and metadata",
                color: "blue",
              },
              {
                icon: Mic,
                title: "Call Recordings",
                description: "Audio recordings stored securely with easy playback",
                color: "violet",
              },
              {
                icon: FileText,
                title: "Voicemails",
                description: "All voicemail messages with transcriptions when available",
                color: "amber",
              },
              {
                icon: Database,
                title: "Fax Documents",
                description: "Inbound and outbound fax documents preserved digitally",
                color: "emerald",
              },
              {
                icon: Users,
                title: "User Data",
                description: "Extension profiles, settings, and contact information",
                color: "rose",
              },
            ].map((item) => {
              const Icon = item.icon;
              const colorClasses: Record<string, { bg: string; icon: string; border: string }> = {
                teal: { bg: "bg-teal-50", icon: "text-teal-600", border: "border-teal-200" },
                blue: { bg: "bg-blue-50", icon: "text-blue-600", border: "border-blue-200" },
                violet: { bg: "bg-violet-50", icon: "text-violet-600", border: "border-violet-200" },
                amber: { bg: "bg-amber-50", icon: "text-amber-600", border: "border-amber-200" },
                emerald: { bg: "bg-emerald-50", icon: "text-emerald-600", border: "border-emerald-200" },
                rose: { bg: "bg-rose-50", icon: "text-rose-600", border: "border-rose-200" },
              };
              const colors = colorClasses[item.color];

              return (
                <div
                  key={item.title}
                  className={`p-6 rounded-2xl ${colors.bg} border ${colors.border} hover:shadow-lg transition-all`}
                >
                  <div className={`p-3 rounded-xl ${colors.bg} border ${colors.border} w-fit mb-4`}>
                    <Icon className={`h-6 w-6 ${colors.icon}`} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h3>
                  <p className="text-slate-600">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
              Why Choose 3CX BackupWiz?
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Built specifically for self-hosted and on-premises 3CX installations
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-200">
              <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl w-fit mb-6 shadow-lg shadow-teal-500/25">
                <RefreshCw className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">
                Automated Real-time Sync
              </h3>
              <p className="text-slate-600 mb-4">
                Set it and forget it. BackupWiz continuously monitors your 3CX system and
                automatically backs up new data as it&apos;s created. Never worry about missing
                important communications.
              </p>
              <ul className="space-y-2">
                {["Continuous monitoring", "Incremental backups", "Configurable sync intervals"].map(
                  (item) => (
                    <li key={item} className="flex items-center gap-2 text-slate-600">
                      <CheckCircle className="h-4 w-4 text-teal-500" />
                      {item}
                    </li>
                  )
                )}
              </ul>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-200">
              <div className="p-3 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl w-fit mb-6 shadow-lg shadow-violet-500/25">
                <Lock className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">
                Enterprise Security
              </h3>
              <p className="text-slate-600 mb-4">
                Your data is protected with industry-leading security measures. All backups
                are encrypted at rest and in transit, with strict access controls.
              </p>
              <ul className="space-y-2">
                {["AES-256 encryption", "Role-based access control", "Secure SSH connections"].map(
                  (item) => (
                    <li key={item} className="flex items-center gap-2 text-slate-600">
                      <CheckCircle className="h-4 w-4 text-violet-500" />
                      {item}
                    </li>
                  )
                )}
              </ul>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-200">
              <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl w-fit mb-6 shadow-lg shadow-amber-500/25">
                <Search className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">
                Powerful Search
              </h3>
              <p className="text-slate-600 mb-4">
                Find any message, recording, or document instantly. Our advanced search
                lets you filter by date, participant, content type, and more.
              </p>
              <ul className="space-y-2">
                {["Full-text search", "Advanced filters", "Export capabilities"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-slate-600">
                    <CheckCircle className="h-4 w-4 text-amber-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-200">
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl w-fit mb-6 shadow-lg shadow-emerald-500/25">
                <Cloud className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">
                Cloud Storage
              </h3>
              <p className="text-slate-600 mb-4">
                Your backups are stored securely in the cloud with automatic redundancy.
                Access your data from anywhere, anytime.
              </p>
              <ul className="space-y-2">
                {["99.9% uptime SLA", "Geographic redundancy", "Instant access"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-slate-600">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { value: "99.9%", label: "Uptime SLA" },
              { value: "256-bit", label: "Encryption" },
              { value: "24/7", label: "Monitoring" },
              { value: "100%", label: "Data Recovery" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-4xl lg:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400 mb-2">
                  {stat.value}
                </div>
                <div className="text-slate-400 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl w-fit mx-auto mb-8 shadow-lg shadow-teal-500/25">
            <Clock className="h-8 w-8 text-white" />
          </div>

          <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
            Start Protecting Your Communications Today
          </h2>
          <p className="text-lg text-slate-600 mb-8 max-w-2xl mx-auto">
            Join businesses that trust 3CX BackupWiz to protect their critical
            communication data. Get started in minutes.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="px-8 py-4 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-xl shadow-xl shadow-teal-500/30 hover:shadow-teal-500/50 transition-all text-lg flex items-center gap-2"
            >
              Start Free Trial
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/pricing"
              className="px-8 py-4 bg-white text-slate-700 font-semibold rounded-xl border-2 border-slate-200 hover:border-slate-300 transition-all text-lg"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
