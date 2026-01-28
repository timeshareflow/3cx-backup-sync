import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { HeartbeatProvider } from "@/components/layout/HeartbeatProvider";
import { PasswordChangeRedirect } from "@/components/layout/PasswordChangeRedirect";
import { ImpersonationBanner } from "@/components/layout/ImpersonationBanner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HeartbeatProvider>
      <PasswordChangeRedirect>
        <ImpersonationBanner />
        <div className="flex h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </div>
      </PasswordChangeRedirect>
    </HeartbeatProvider>
  );
}
