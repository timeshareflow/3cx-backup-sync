"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

const HEARTBEAT_INTERVAL = 5 * 60 * 1000;  // 5 minutes (was 1 minute)
const ACTIVITY_THRESHOLD = 10 * 60 * 1000; // stop after 10 min of inactivity

export function useHeartbeat() {
  const { user, currentTenant, viewingAsTenant, profile } = useAuth();
  const isAuthenticated = !!user;
  const lastActivityRef = useRef<number>(Date.now());
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialHeartbeatSentRef = useRef<boolean>(false);

  const isSuperAdmin = profile?.role === "super_admin";
  const effectiveTenantId = isSuperAdmin
    ? viewingAsTenant?.id
    : currentTenant?.tenant_id;

  const sendHeartbeat = useCallback(async (force: boolean = false) => {
    if (!force) {
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      if (timeSinceActivity > ACTIVITY_THRESHOLD) return;
    }

    try {
      await fetch("/api/heartbeat", { method: "POST", headers: { "Content-Type": "application/json" } });
    } catch {
      // heartbeat is non-critical, fail silently
    }
  }, []);

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !effectiveTenantId) {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      initialHeartbeatSentRef.current = false;
      return;
    }

    lastActivityRef.current = Date.now();

    if (!initialHeartbeatSentRef.current) {
      initialHeartbeatSentRef.current = true;
      sendHeartbeat(true);
    }

    heartbeatIntervalRef.current = setInterval(() => sendHeartbeat(false), HEARTBEAT_INTERVAL);

    // Track activity — only update timestamp, never send extra heartbeats
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, updateActivity, { passive: true }));

    // On tab visible: update activity timestamp but do NOT send an extra heartbeat write
    const handleVisibility = () => {
      if (document.visibilityState === "visible") updateActivity();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      events.forEach((e) => window.removeEventListener(e, updateActivity));
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isAuthenticated, effectiveTenantId, sendHeartbeat, updateActivity]);

  return { updateActivity };
}
