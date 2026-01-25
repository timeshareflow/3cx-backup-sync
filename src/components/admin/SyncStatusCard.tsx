"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle, XCircle, Clock, AlertCircle, Activity, ChevronRight } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/date";
import type { SyncStatus } from "@/types";

// Map sync types to their navigation URLs
const syncTypeRoutes: Record<string, string> = {
  messages: "/conversations",
  media: "/media",
  extensions: "/extensions",
  recordings: "/recordings",
  voicemails: "/voicemails",
  faxes: "/faxes",
  cdr: "/call-logs",
  meetings: "/meetings",
};

export function SyncStatusCard() {
  const router = useRouter();
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSyncStatus();
    const interval = setInterval(fetchSyncStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchSyncStatus = async () => {
    try {
      const response = await fetch("/api/sync/status");
      if (response.ok) {
        const data = await response.json();
        setSyncStatuses(data.sync_status || []);
      }
    } catch (error) {
      console.error("Failed to fetch sync status:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <RefreshCw className="h-5 w-5 text-teal-500 animate-spin" />;
      case "success":
        return <CheckCircle className="h-5 w-5 text-emerald-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      running: "bg-teal-100 text-teal-800 border border-teal-200",
      success: "bg-emerald-100 text-emerald-800 border border-emerald-200",
      error: "bg-red-100 text-red-800 border border-red-200",
      idle: "bg-slate-100 text-slate-700 border border-slate-200",
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[status] || styles.idle}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-lg shadow-teal-500/25">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Sync Status</h2>
        </div>
        <button
          onClick={fetchSyncStatus}
          className="p-2.5 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-colors"
        >
          <RefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading && syncStatuses.length === 0 ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-xl" />
          ))}
        </div>
      ) : syncStatuses.length === 0 ? (
        <div className="text-center py-8">
          <div className="p-4 bg-slate-100 rounded-full inline-block mb-3">
            <AlertCircle className="h-8 w-8 text-slate-400" />
          </div>
          <p className="font-semibold text-slate-700">No sync status available</p>
          <p className="text-sm text-slate-500 mt-1">Run the sync service to start archiving</p>
        </div>
      ) : (
        <div className="space-y-3">
          {syncStatuses.map((sync) => {
            const route = syncTypeRoutes[sync.sync_type];
            const isClickable = !!route;

            return (
              <div
                key={sync.id}
                onClick={() => isClickable && router.push(route)}
                className={`flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-slate-200 transition-all duration-200 ${
                  isClickable
                    ? "cursor-pointer hover:border-teal-300 hover:shadow-md hover:shadow-teal-100/50 group"
                    : ""
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {getStatusIcon(sync.status)}
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold text-slate-800 capitalize ${isClickable ? "group-hover:text-teal-700" : ""}`}>
                      {sync.sync_type}
                    </p>
                    <p className="text-sm text-slate-500">
                      {sync.last_success_at
                        ? `Last sync: ${formatRelativeTime(sync.last_success_at)}`
                        : "Never synced"}
                    </p>
                    {sync.notes && sync.items_synced === 0 && (
                      <p className="text-xs text-amber-600 mt-1 truncate" title={sync.notes}>
                        {sync.notes}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    {getStatusBadge(sync.status)}
                    {sync.items_synced > 0 && (
                      <p className="text-xs text-slate-500 mt-2 font-medium">
                        {sync.items_synced.toLocaleString()} records
                      </p>
                    )}
                  </div>
                  {isClickable && (
                    <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-teal-500 transition-colors" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {syncStatuses.some((s) => s.status === "error") && (
        <div className="mt-4 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 font-medium">
              {syncStatuses.find((s) => s.status === "error")?.last_error ||
                "An error occurred during sync"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
