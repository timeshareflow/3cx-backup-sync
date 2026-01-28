"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X, User, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ImpersonationSession {
  id: string;
  startedAt: string;
  reason: string | null;
  impersonatedUser: {
    id: string;
    email: string;
    full_name: string | null;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  expiresAt: string;
}

export function ImpersonationBanner() {
  const router = useRouter();
  const [session, setSession] = useState<ImpersonationSession | null>(null);
  const [isEnding, setIsEnding] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>("");

  const checkImpersonation = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/impersonate/active");
      if (!res.ok) return;

      const data = await res.json();
      if (data.isImpersonating && data.session) {
        setSession(data.session);
      } else {
        setSession(null);
      }
    } catch (error) {
      console.error("Error checking impersonation:", error);
    }
  }, []);

  useEffect(() => {
    checkImpersonation();
    // Check every 30 seconds
    const interval = setInterval(checkImpersonation, 30000);
    return () => clearInterval(interval);
  }, [checkImpersonation]);

  // Update time remaining
  useEffect(() => {
    if (!session?.expiresAt) return;

    const updateTime = () => {
      const remaining = new Date(session.expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setTimeRemaining("Expired");
        checkImpersonation();
        return;
      }

      const minutes = Math.floor(remaining / 1000 / 60);
      const seconds = Math.floor((remaining / 1000) % 60);
      setTimeRemaining(`${minutes}m ${seconds}s`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [session?.expiresAt, checkImpersonation]);

  const handleEndImpersonation = async () => {
    setIsEnding(true);
    try {
      const res = await fetch("/api/admin/impersonate/stop", {
        method: "POST",
      });

      if (res.ok) {
        setSession(null);
        // Redirect to super admin dashboard
        router.push("/admin/super");
        router.refresh();
      }
    } catch (error) {
      console.error("Error ending impersonation:", error);
    } finally {
      setIsEnding(false);
    }
  };

  if (!session) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white shadow-lg">
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-semibold">Impersonation Mode</span>
            </div>

            <div className="flex items-center gap-2 text-red-100">
              <User className="h-4 w-4" />
              <span>
                Viewing as:{" "}
                <strong className="text-white">
                  {session.impersonatedUser.full_name || session.impersonatedUser.email}
                </strong>
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-red-100">
              <span>Tenant:</span>
              <strong className="text-white">{session.tenant.name}</strong>
            </div>

            <div className="hidden md:flex items-center gap-2 text-red-100">
              <Clock className="h-4 w-4" />
              <span>Expires in: {timeRemaining}</span>
            </div>

            {session.reason && (
              <div className="hidden lg:block text-red-100 text-sm">
                Reason: {session.reason}
              </div>
            )}
          </div>

          <Button
            onClick={handleEndImpersonation}
            disabled={isEnding}
            variant="outline"
            size="sm"
            className="bg-white text-red-600 hover:bg-red-50 border-white"
          >
            {isEnding ? (
              "Ending..."
            ) : (
              <>
                <X className="h-4 w-4 mr-1" />
                Return to Super Admin
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
