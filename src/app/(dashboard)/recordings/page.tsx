"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Phone, PhoneIncoming, PhoneOutgoing, Download, Play, Pause, Search, Loader2, Square } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface CallRecording {
  id: string;
  caller_number: string | null;
  caller_name: string | null;
  callee_number: string | null;
  callee_name: string | null;
  extension_number: string | null;
  direction: string | null;
  duration_seconds: number | null;
  file_size: number | null;
  started_at: string;
  storage_path: string;
}

type DirectionFilter = "all" | "inbound" | "outbound" | "internal";

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<CallRecording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<DirectionFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});

  const fetchRecordings = useCallback(async (pageNum: number, direction: DirectionFilter, search: string, append = false) => {
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

      if (search) {
        params.set("search", search);
      }

      const response = await fetch(`/api/recordings?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch recordings");
      }

      if (append) {
        setRecordings((prev) => [...prev, ...data.data]);
      } else {
        setRecordings(data.data);
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
    fetchRecordings(1, filter, searchQuery);
  }, [filter, searchQuery, fetchRecordings]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const fetchAudioUrl = async (id: string): Promise<string | null> => {
    if (audioUrls[id]) return audioUrls[id];
    try {
      const response = await fetch(`/api/recordings/${id}`);
      if (!response.ok) return null;
      const data = await response.json();
      setAudioUrls((prev) => ({ ...prev, [id]: data.url }));
      return data.url;
    } catch {
      return null;
    }
  };

  const handlePlay = async (id: string) => {
    // If already playing this recording, pause it
    if (playingId === id && audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setLoadingAudioId(id);
    const url = await fetchAudioUrl(id);
    setLoadingAudioId(null);

    if (!url) {
      setError("Failed to load recording audio");
      return;
    }

    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      setPlayingId(null);
      setError("Failed to play recording");
    };

    try {
      await audio.play();
      setPlayingId(id);
    } catch {
      setError("Failed to play recording");
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlayingId(null);
  };

  const handleDownload = async (id: string, callerName: string | null, callerNumber: string | null) => {
    const url = await fetchAudioUrl(id);
    if (!url) {
      setError("Failed to get download URL");
      return;
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = `recording-${callerName || callerNumber || id}.wav`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRecordings(nextPage, filter, searchQuery, true);
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

  const getDirectionIcon = (direction: string | null) => {
    switch (direction) {
      case "inbound":
        return <PhoneIncoming className="h-4 w-4 text-green-500" />;
      case "outbound":
        return <PhoneOutgoing className="h-4 w-4 text-blue-500" />;
      default:
        return <Phone className="h-4 w-4 text-slate-400" />;
    }
  };

  const filterOptions: { value: DirectionFilter; label: string }[] = [
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
          <h1 className="text-2xl font-bold text-slate-800">Call Recordings</h1>
          <p className="text-slate-500 mt-1">
            {total} recordings synced from 3CX
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
      {isLoading && recordings.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-teal-500 animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && recordings.length === 0 && (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
            <Phone className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">No call recordings found</h3>
          <p className="text-slate-500">
            Call recordings from 3CX will appear here once synced.
          </p>
        </div>
      )}

      {/* Recordings Table */}
      {recordings.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Direction</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Caller</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Callee</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Extension</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Size</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Recorded</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recordings.map((recording) => (
                <tr
                  key={recording.id}
                  className={`transition-colors ${
                    playingId === recording.id
                      ? "bg-teal-50"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {getDirectionIcon(recording.direction)}
                      <span className="text-sm text-slate-600 capitalize">{recording.direction || "Unknown"}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{recording.caller_name || recording.caller_number || "Unknown"}</p>
                      {recording.caller_name && recording.caller_number && (
                        <p className="text-xs text-slate-500">{recording.caller_number}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{recording.callee_name || recording.callee_number || "Unknown"}</p>
                      {recording.callee_name && recording.callee_number && (
                        <p className="text-xs text-slate-500">{recording.callee_number}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{recording.extension_number || "-"}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-mono">{formatDuration(recording.duration_seconds)}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{formatFileSize(recording.file_size)}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {formatDistanceToNow(new Date(recording.started_at), { addSuffix: true })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {loadingAudioId === recording.id ? (
                        <div className="p-2">
                          <Loader2 className="h-4 w-4 text-teal-500 animate-spin" />
                        </div>
                      ) : playingId === recording.id ? (
                        <button
                          onClick={handleStop}
                          className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Stop"
                        >
                          <Square className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePlay(recording.id)}
                          className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title="Play"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDownload(recording.id, recording.caller_name, recording.caller_number)}
                        className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
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
