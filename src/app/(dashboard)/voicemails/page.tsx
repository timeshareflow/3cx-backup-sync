"use client";

import { useState, useEffect, useCallback } from "react";
import { Voicemail, Play, Pause, Download, Search, Check, Circle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface VoicemailRecord {
  id: string;
  extension_number: string | null;
  caller_number: string | null;
  caller_name: string | null;
  duration_seconds: number | null;
  file_size: number | null;
  is_read: boolean;
  transcription: string | null;
  received_at: string;
  storage_path: string;
}

type ReadFilter = "all" | "unread" | "read";

export default function VoicemailsPage() {
  const [voicemails, setVoicemails] = useState<VoicemailRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<ReadFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);

  const fetchVoicemails = useCallback(async (pageNum: number, readFilter: ReadFilter, search: string, append = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        page_size: "20",
      });

      if (readFilter === "unread") {
        params.set("is_read", "false");
      } else if (readFilter === "read") {
        params.set("is_read", "true");
      }

      if (search) {
        params.set("search", search);
      }

      const response = await fetch(`/api/voicemails?${params}`);
      if (!response.ok) throw new Error("Failed to fetch voicemails");

      const data = await response.json();

      if (append) {
        setVoicemails((prev) => [...prev, ...data.data]);
      } else {
        setVoicemails(data.data);
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
    fetchVoicemails(1, filter, searchQuery);
  }, [filter, searchQuery, fetchVoicemails]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchVoicemails(nextPage, filter, searchQuery, true);
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return "Unknown";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filterOptions: { value: ReadFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "unread", label: "Unread" },
    { value: "read", label: "Read" },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Voicemails</h1>
          <p className="text-slate-500 mt-1">
            {total} voicemails synced from 3CX
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by caller..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === option.value
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
      {isLoading && voicemails.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-teal-500 animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && voicemails.length === 0 && (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
            <Voicemail className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">No voicemails found</h3>
          <p className="text-slate-500">
            Voicemails from 3CX will appear here once synced.
          </p>
        </div>
      )}

      {/* Voicemails List */}
      {voicemails.length > 0 && (
        <div className="space-y-4">
          {voicemails.map((vm) => (
            <div
              key={vm.id}
              className={`bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-5 transition-all hover:shadow-xl ${
                !vm.is_read ? "border-l-4 border-l-teal-500" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl ${vm.is_read ? "bg-slate-100" : "bg-teal-100"}`}>
                    <Voicemail className={`h-6 w-6 ${vm.is_read ? "text-slate-500" : "text-teal-600"}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-slate-800">
                        {vm.caller_name || vm.caller_number || "Unknown Caller"}
                      </h3>
                      {!vm.is_read && (
                        <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-semibold rounded-full">
                          New
                        </span>
                      )}
                    </div>
                    {vm.caller_name && vm.caller_number && (
                      <p className="text-sm text-slate-500">{vm.caller_number}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                      <span>Extension: {vm.extension_number || "-"}</span>
                      <span className="font-mono">{formatDuration(vm.duration_seconds)}</span>
                      <span>{formatFileSize(vm.file_size)}</span>
                    </div>
                    {vm.transcription && (
                      <p className="mt-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                        {vm.transcription}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <span className="text-sm text-slate-500">
                    {formatDistanceToNow(new Date(vm.received_at), { addSuffix: true })}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPlayingId(playingId === vm.id ? null : vm.id)}
                      className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                      title={playingId === vm.id ? "Pause" : "Play"}
                    >
                      {playingId === vm.id ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                    </button>
                    <button
                      className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                      title="Download"
                    >
                      <Download className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
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
