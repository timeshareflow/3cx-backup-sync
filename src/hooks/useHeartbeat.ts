"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

const HEARTBEAT_INTERVAL = 60 * 1000; // 1 minute
const ACTIVITY_THRESHOLD = 10 * 60 * 1000; // 10 minutes of inactivity before stopping heartbeats

export function useHeartbeat() {
  const { user, currentTenant, viewingAsTenant, profile } = useAuth();
  const isAuthenticated = !!user;
  const lastActivityRef = useRef<number>(Date.now());
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialHeartbeatSentRef = useRef<boolean>(false);

  // Determine if we have a valid tenant to send heartbeat for
  // For super admins viewing as tenant, use that tenant
  // For regular users, use their current tenant
  const isSuperAdmin = profile?.role === "super_admin";
  const effectiveTenantId = isSuperAdmin
    ? viewingAsTenant?.id
    : currentTenant?.tenant_id;

  const sendHeartbeat = useCallback(async (force: boolean = false) => {
    // For forced/initial heartbeat, always send
    // For regular heartbeats, check activity threshold
    if (!force) {
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      if (timeSinceActivity > ACTIVITY_THRESHOLD) {
        return;
      }
    }

    try {
      const response = await fetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        console.debug("Heartbeat response not ok:", response.status);
      }
    } catch (error) {
      // Silently fail - heartbeat is not critical
      console.debug("Heartbeat failed:", error);
    }
  }, []);

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    // Need authentication and a tenant to send heartbeats
    if (!isAuthenticated || !effectiveTenantId) {
      // Clear interval if not authenticated or no tenant
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      initialHeartbeatSentRef.current = false;
      return;
    }

    // Reset activity timestamp when tenant changes
    lastActivityRef.current = Date.now();

    // Send initial heartbeat immediately (forced)
    if (!initialHeartbeatSentRef.current) {
      initialHeartbeatSentRef.current = true;
      sendHeartbeat(true);
    }

    // Set up interval for subsequent heartbeats
    heartbeatIntervalRef.current = setInterval(() => sendHeartbeat(false), HEARTBEAT_INTERVAL);

    // Track user activity
    const events = ["mousedown", "keydown", "scroll", "touchstart", "visibilitychange"];

    const handleActivity = () => {
      updateActivity();
      // Also send heartbeat on activity if we haven't sent one recently
      // This ensures activity is captured even after being idle
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        updateActivity();
        // Send heartbeat when tab becomes visible again
        sendHeartbeat(true);
      }
    };

    events.forEach((event) => {
      if (event === "visibilitychange") {
        document.addEventListener(event, handleVisibility);
      } else {
        window.addEventListener(event, handleActivity, { passive: true });
      }
    });

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      events.forEach((event) => {
        if (event === "visibilitychange") {
          document.removeEventListener(event, handleVisibility);
        } else {
          window.removeEventListener(event, handleActivity);
        }
      });
    };
  }, [isAuthenticated, effectiveTenantId, sendHeartbeat, updateActivity]);

  return { updateActivity };
}
