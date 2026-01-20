"use client";

import { useState, useEffect, useCallback } from "react";
import { Video, Users, Clock, Download, Play, Search, Loader2 } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface MeetingRecording {
  id: string;
  meeting_name: string | null;
  meeting_host: string | null;
  host_extension: string | null;
  participant_count: number | null;
  participants: unknown[] | null;
  file_size: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  has_audio: boolean;
  has_video: boolean;
  meeting_started_at: string | null;
  meeting_ended_at: string | null;
  recorded_at: string;
  storage_path: string;
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<MeetingRecording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchMeetings = useCallback(async (pageNum: number, search: string, append = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        page_size: "20",
      });

      if (search) {
        params.set("search", search);
      }

      const response = await fetch(`/api/meetings?${params}`);
      if (!response.ok) throw new Error("Failed to fetch meeting recordings");

      const data = await response.json();

      if (append) {
        setMeetings((prev) => [...prev, ...data.data]);
      } else {
        setMeetings(data.data);
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
    fetchMeetings(1, searchQuery);
  }, [searchQuery, fetchMeetings]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchMeetings(nextPage, searchQuery, true);
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds || seconds === 0) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remainMins = mins % 60;
      return `${hours}h ${remainMins}m`;
    }
    return `${mins}m ${secs}s`;
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return "Unknown";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Meeting Recordings</h1>
          <p className="text-slate-500 mt-1">
            {total} meeting recordings synced from 3CX
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search meetings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && meetings.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-teal-500 animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && meetings.length === 0 && (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
            <Video className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">No meeting recordings found</h3>
          <p className="text-slate-500">
            Meeting recordings from 3CX will appear here once synced.
          </p>
        </div>
      )}

      {/* Meetings Grid */}
      {meetings.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {meetings.map((meeting) => (
            <div
              key={meeting.id}
              className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 overflow-hidden hover:shadow-xl transition-shadow"
            >
              {/* Thumbnail/Preview Area */}
              <div className="relative bg-slate-900 aspect-video flex items-center justify-center">
                <div className="text-center">
                  <Video className="h-12 w-12 text-slate-600 mx-auto mb-2" />
                  {meeting.width && meeting.height && (
                    <span className="text-xs text-slate-500">{meeting.width}x{meeting.height}</span>
                  )}
                </div>
                {/* Duration badge */}
                <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 text-white text-xs font-medium rounded">
                  {formatDuration(meeting.duration_seconds)}
                </div>
                {/* Media badges */}
                <div className="absolute bottom-2 left-2 flex gap-1">
                  {meeting.has_video && (
                    <span className="px-2 py-1 bg-teal-500/90 text-white text-xs font-medium rounded">Video</span>
                  )}
                  {meeting.has_audio && (
                    <span className="px-2 py-1 bg-blue-500/90 text-white text-xs font-medium rounded">Audio</span>
                  )}
                </div>
              </div>

              {/* Meeting Info */}
              <div className="p-4">
                <h3 className="font-semibold text-slate-800 mb-1 truncate">
                  {meeting.meeting_name || "Untitled Meeting"}
                </h3>
                <p className="text-sm text-slate-500 mb-3">
                  Host: {meeting.meeting_host || meeting.host_extension || "Unknown"}
                </p>

                <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span>{meeting.participant_count || 0}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>{formatDuration(meeting.duration_seconds)}</span>
                  </div>
                  <span>{formatFileSize(meeting.file_size)}</span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className="text-xs text-slate-400">
                    {meeting.meeting_started_at
                      ? format(new Date(meeting.meeting_started_at), "MMM d, yyyy HH:mm")
                      : formatDistanceToNow(new Date(meeting.recorded_at), { addSuffix: true })}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                      title="Play"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    <button
                      className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
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
