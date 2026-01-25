"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

const HEARTBEAT_INTERVAL = 60 * 1000; // 1 minute
const ACTIVITY_THRESHOLD = 5 * 60 * 1000; // 5 minutes of inactivity before stopping heartbeats

export function useHeartbeat() {
  const { user, currentTenant } = useAuth();
  const isAuthenticated = !!user;
  const lastActivityRef = useRef<number>(Date.now());
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const sendHeartbeat = useCallback(async () => {
    // Only send if user has been active recently
    const timeSinceActivity = Date.now() - lastActivityRef.current;
    if (timeSinceActivity > ACTIVITY_THRESHOLD) {
      return;
    }

    try {
      await fetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      // Silently fail - heartbeat is not critical
      console.debug("Heartbeat failed:", error);
    }
  }, []);

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !currentTenant) {
      // Clear interval if not authenticated
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      return;
    }

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Track user activity
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      events.forEach((event) => {
        window.removeEventListener(event, updateActivity);
      });
    };
  }, [isAuthenticated, currentTenant, sendHeartbeat, updateActivity]);

  return { updateActivity };
}
