"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export function PasswordChangeRedirect({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, passwordChangeRequired, isLoading } = useAuth();

  useEffect(() => {
    // Wait until auth is loaded
    if (isLoading) return;

    // If user is logged in and needs to change password, redirect
    if (user && passwordChangeRequired) {
      router.push("/auth/change-password");
    }
  }, [user, passwordChangeRequired, isLoading, router]);

  // If password change is required, don't render children (will redirect)
  if (user && passwordChangeRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Redirecting...</div>
      </div>
    );
  }

  return <>{children}</>;
}
