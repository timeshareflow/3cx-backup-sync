"use client";

import Link from "next/link";
import { MessageSquare, ArrowRight, Users, Globe, UserCircle, Image as ImageIcon, Film, FileText, Music } from "lucide-react";
import { formatMessageTime } from "@/lib/utils/date";
import { Spinner } from "@/components/ui/Spinner";
import type { MessageWithMedia, Conversation, MediaFile } from "@/types";

interface SearchResultMessage extends MessageWithMedia {
  conversations?: Pick<Conversation, "id" | "conversation_name" | "is_external" | "is_group_chat">;
}

interface SearchResultsProps {
  results: SearchResultMessage[];
  isLoading: boolean;
  query: string;
  totalCount?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

interface ThreadGroup {
  conversationId: string;
  conversation: SearchResultMessage["conversations"];
  messages: SearchResultMessage[];
}

function getMediaType(mimeType: string | null): "image" | "video" | "audio" | "document" {
  if (!mimeType) return "document";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

function MediaThumbnail({ media }: { media: MediaFile }) {
  const type = getMediaType(media.mime_type);
  const Icon = type === "image" ? ImageIcon : type === "video" ? Film : type === "audio" ? Music : FileText;
  const bg = type === "image" ? "bg-blue-50 border-blue-200" : type === "video" ? "bg-purple-50 border-purple-200" : type === "audio" ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200";
  const iconColor = type === "image" ? "text-blue-400" : type === "video" ? "text-purple-400" : type === "audio" ? "text-amber-400" : "text-gray-400";

  const handleOpen = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch(`/api/media/${media.id}`);
      if (res.ok) {
        const { url } = await res.json();
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      // silently fail
    }
  };

  return (
    <button
      onClick={handleOpen}
      className={`h-10 w-10 rounded-lg border ${bg} flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity cursor-pointer`}
      title={`Open ${media.file_name || type}`}
    >
      <Icon className={`h-4 w-4 ${iconColor}`} />
    </button>
  );
}

function highlightText(text: string, searchQuery: string) {
  if (!searchQuery || !text) return text;
  try {
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${escaped})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === searchQuery.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 rounded px-0.5">{part}</mark>
      ) : part
    );
  } catch {
    return text;
  }
}

function ThreadCard({ thread, query }: { thread: ThreadGroup; query: string }) {
  const conv = thread.conversation;
  const name = conv?.conversation_name || "Unnamed conversation";
  const Icon = conv?.is_external ? Globe : conv?.is_group_chat ? Users : UserCircle;
  const iconColor = conv?.is_external ? "text-amber-500" : conv?.is_group_chat ? "text-purple-500" : "text-teal-500";
  const iconBg = conv?.is_external ? "bg-amber-50" : conv?.is_group_chat ? "bg-purple-50" : "bg-teal-50";
  const badgeLabel = conv?.is_external ? "External" : conv?.is_group_chat ? "Group" : "Internal";
  const badgeColor = conv?.is_external
    ? "bg-amber-100 text-amber-700"
    : conv?.is_group_chat
    ? "bg-purple-100 text-purple-700"
    : "bg-teal-100 text-teal-700";

  // Show messages in chronological order, most recent last (natural thread flow)
  const sorted = [...thread.messages].sort(
    (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
  );
  const SHOW_MAX = 5;
  const visible = sorted.slice(0, SHOW_MAX);
  const hiddenCount = sorted.length - visible.length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-teal-200 transition-all overflow-hidden">
      {/* Thread header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-xl ${iconBg} shrink-0`}>
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm truncate">{name}</p>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${badgeColor}`}>
            {badgeLabel}
          </span>
        </div>
        <span className="shrink-0 ml-3 px-2.5 py-1 bg-teal-100 text-teal-700 text-xs font-bold rounded-full">
          {thread.messages.length} match{thread.messages.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* Messages in thread */}
      <div className="divide-y divide-slate-50">
        {visible.map((message) => (
          <Link
            key={message.id}
            href={`/conversations/${message.conversation_id}?highlight=${message.id}&q=${encodeURIComponent(query)}`}
            className="flex items-start gap-3 px-4 py-3 hover:bg-teal-50/40 transition-colors group"
          >
            {/* Avatar */}
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
              {message.sender_name
                ? message.sender_name.charAt(0).toUpperCase()
                : message.sender_identifier?.charAt(0) || "?"}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-sm font-semibold text-slate-800">
                  {message.sender_name || message.sender_identifier || "Unknown"}
                </span>
                {message.sender_identifier && message.sender_name && (
                  <span className="text-xs text-slate-400">{message.sender_identifier}</span>
                )}
                <span className="text-xs text-slate-400 ml-auto shrink-0">
                  {formatMessageTime(message.sent_at)}
                </span>
              </div>

              {message.content && (
                <p className="text-sm text-slate-600 line-clamp-2">
                  {highlightText(message.content, query)}
                </p>
              )}

              {message.has_media && message.media_files.length > 0 && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  {message.media_files.slice(0, 5).map((file) => (
                    <MediaThumbnail key={file.id} media={file} />
                  ))}
                  {message.media_files.length > 5 && (
                    <span className="text-xs text-slate-400">+{message.media_files.length - 5}</span>
                  )}
                </div>
              )}
            </div>

            <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-teal-400 transition-colors shrink-0 mt-1" />
          </Link>
        ))}

        {hiddenCount > 0 && (
          <div className="px-4 py-2 text-xs text-slate-400 text-center">
            +{hiddenCount} more message{hiddenCount !== 1 ? "s" : ""} in this thread
          </div>
        )}
      </div>

      {/* Footer — view full conversation */}
      <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
        <Link
          href={`/conversations/${thread.conversationId}?q=${encodeURIComponent(query)}`}
          className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors"
        >
          View full conversation
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

export function SearchResults({
  results,
  isLoading,
  query,
  totalCount,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!query) {
    return (
      <div className="text-center py-12 text-slate-500">
        <MessageSquare className="h-12 w-12 mx-auto mb-4 text-slate-300" />
        <p className="text-lg">Enter a search term to find messages</p>
        <p className="text-sm mt-1">Search through all archived conversations</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <MessageSquare className="h-12 w-12 mx-auto mb-4 text-slate-300" />
        <p className="text-lg">No results found for &quot;{query}&quot;</p>
        <p className="text-sm mt-1">Try different keywords or adjust filters</p>
      </div>
    );
  }

  // Group messages by conversation, preserving order of first appearance
  const threadMap = new Map<string, ThreadGroup>();
  for (const msg of results) {
    const convId = msg.conversation_id;
    if (!threadMap.has(convId)) {
      threadMap.set(convId, {
        conversationId: convId,
        conversation: msg.conversations,
        messages: [],
      });
    }
    threadMap.get(convId)!.messages.push(msg);
  }
  const threads = Array.from(threadMap.values());

  return (
    <div>
      {totalCount !== undefined && (
        <p className="text-sm text-slate-500 mb-4">
          {totalCount.toLocaleString()} message{totalCount !== 1 ? "s" : ""} across{" "}
          {threads.length} conversation{threads.length !== 1 ? "s" : ""}
          {results.length < totalCount && ` (showing ${results.length} messages)`}
        </p>
      )}

      <div className="space-y-4">
        {threads.map((thread) => (
          <ThreadCard key={thread.conversationId} thread={thread} query={query} />
        ))}
      </div>

      {hasMore && (
        <div className="text-center mt-6">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {isLoadingMore ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" />
                Loading more...
              </span>
            ) : (
              "Load more results"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
