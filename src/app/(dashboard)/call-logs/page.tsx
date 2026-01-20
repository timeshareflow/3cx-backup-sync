"use client";

import { useState, useEffect, useCallback } from "react";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, Search, Loader2, Disc } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface CallLog {
  id: string;
  call_type: string | null;
  direction: string | null;
  caller_number: string | null;
  caller_name: string | null;
  callee_number: string | null;
  callee_name: string | null;
  extension_number: string | null;
  queue_name: string | null;
  ring_duration: number | null;
  talk_duration: number | null;
  total_duration: number | null;
  status: string | null;
  hangup_cause: string | null;
  has_recording: boolean;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
}

type DirectionFilter = "all" | "inbound" | "outbound" | "internal";
type StatusFilter = "all" | "answered" | "missed" | "busy";

export default function CallLogsPage() {
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchCallLogs = useCallback(async (pageNum: number, direction: DirectionFilter, status: StatusFilter, search: string, append = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        page_size: "20",
      });

      if (direction !== "all") {
        params.set("direction", direction);
      }

      if (status !== "all") {
        params.set("status", status);
      }

      if (search) {
        params.set("search", search);
      }

      const response = await fetch(`/api/call-logs?${params}`);
      if (!response.ok) throw new Error("Failed to fetch call logs");

      const data = await response.json();

      if (append) {
        setCallLogs((prev) => [...prev, ...data.data]);
      } else {
        setCallLogs(data.data);
      }

      setTotal(data.total);
      setHasMore(data.has_more);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    fetchCallLogs(1, directionFilter, statusFilter, searchQuery);
  }, [directionFilter, statusFilter, searchQuery, fetchCallLogs]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchCallLogs(nextPage, directionFilter, statusFilter, searchQuery, true);
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds || seconds === 0) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remainMins = mins % 60;
      return `${hours}:${remainMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getCallIcon = (direction: string | null, status: string | null) => {
    if (status === "missed" || status === "no_answer") {
      return <PhoneMissed className="h-4 w-4 text-red-500" />;
    }
    switch (direction) {
      case "inbound":
        return <PhoneIncoming className="h-4 w-4 text-green-500" />;
      case "outbound":
        return <PhoneOutgoing className="h-4 w-4 text-blue-500" />;
      default:
        return <Phone className="h-4 w-4 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: string | null) => {
    const styles: Record<string, string> = {
      answered: "bg-emerald-100 text-emerald-700",
      completed: "bg-emerald-100 text-emerald-700",
      missed: "bg-red-100 text-red-700",
      no_answer: "bg-red-100 text-red-700",
      busy: "bg-yellow-100 text-yellow-700",
      failed: "bg-red-100 text-red-700",
    };

    return (
      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${styles[status || ""] || "bg-slate-100 text-slate-600"}`}>
        {status?.replace("_", " ") || "Unknown"}
      </span>
    );
  };

  const directionOptions: { value: DirectionFilter; label: string }[] = [
    { value: "all", label: "All Calls" },
    { value: "inbound", label: "Inbound" },
    { value: "outbound", label: "Outbound" },
    { value: "internal", label: "Internal" },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Call Detail Records</h1>
          <p className="text-slate-500 mt-1">
            {total} call records synced from 3CX
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by number or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          {/* Direction Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {directionOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setDirectionFilter(option.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  directionFilter === option.value
                    ? "bg-white text-teal-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && callLogs.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-teal-500 animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && callLogs.length === 0 && (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
            <Phone className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">No call records found</h3>
          <p className="text-slate-500">
            Call detail records from 3CX will appear here once synced.
          </p>
        </div>
      )}

      {/* Call Logs Table */}
      {callLogs.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">From</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">To</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Extension</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ring</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Talk</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Rec</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {callLogs.map((call) => (
                <tr key={call.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {getCallIcon(call.direction, call.status)}
                      <span className="text-sm text-slate-600 capitalize">{call.direction || "Unknown"}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{call.caller_name || call.caller_number || "Unknown"}</p>
                      {call.caller_name && call.caller_number && (
                        <p className="text-xs text-slate-500">{call.caller_number}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{call.callee_name || call.callee_number || "Unknown"}</p>
                      {call.callee_name && call.callee_number && (
                        <p className="text-xs text-slate-500">{call.callee_number}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{call.extension_number || "-"}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-mono">{formatDuration(call.ring_duration)}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-mono">{formatDuration(call.talk_duration)}</td>
                  <td className="px-6 py-4">{getStatusBadge(call.status)}</td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm text-slate-800">{format(new Date(call.started_at), "MMM d, yyyy")}</p>
                      <p className="text-xs text-slate-500">{format(new Date(call.started_at), "HH:mm:ss")}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {call.has_recording && (
                      <span title="Has recording">
                        <Disc className="h-4 w-4 text-teal-500 mx-auto" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center mt-8">
          <button
            onClick={loadMore}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-3 bg-teal-500 text-white rounded-xl font-medium hover:bg-teal-600 disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Load More"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
