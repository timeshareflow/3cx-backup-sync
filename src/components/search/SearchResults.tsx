"use client";

import Link from "next/link";
import { MessageSquare, ArrowRight, Users, Globe, UserCircle } from "lucide-react";
import { formatMessageTime } from "@/lib/utils/date";
import { Spinner } from "@/components/ui/Spinner";
import type { MessageWithMedia, Conversation } from "@/types";

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
        <p className="text-sm mt-1">
          Search through all archived conversations
        </p>
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

  const highlightText = (text: string, searchQuery: string) => {
    if (!searchQuery || !text) return text;

    try {
      const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const parts = text.split(new RegExp(`(${escaped})`, "gi"));
      return parts.map((part, i) =>
        part.toLowerCase() === searchQuery.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 rounded px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      );
    } catch {
      return text;
    }
  };

  const getConversationLabel = (msg: SearchResultMessage) => {
    const conv = msg.conversations;
    if (!conv) return null;
    const name = conv.conversation_name || "Unnamed conversation";
    const Icon = conv.is_external ? Globe : conv.is_group_chat ? Users : UserCircle;
    const color = conv.is_external
      ? "text-amber-500"
      : conv.is_group_chat
        ? "text-purple-500"
        : "text-teal-500";
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="truncate">{name}</span>
      </div>
    );
  };

  return (
    <div>
      {totalCount !== undefined && (
        <p className="text-sm text-slate-500 mb-4">
          Found {totalCount.toLocaleString()} result{totalCount !== 1 ? "s" : ""}
          {results.length < totalCount && ` (showing ${results.length})`}
        </p>
      )}

      <div className="space-y-3">
        {results.map((message) => (
          <Link
            key={message.id}
            href={`/conversations/${message.conversation_id}?highlight=${message.id}`}
            className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-teal-300 hover:shadow-md hover:shadow-teal-500/10 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* Conversation context */}
                {getConversationLabel(message)}

                {/* Sender and time */}
                <div className="flex items-center gap-2 mt-1.5 mb-1.5">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-medium shrink-0">
                    {message.sender_name
                      ? message.sender_name.charAt(0).toUpperCase()
                      : message.sender_identifier?.charAt(0) || "?"}
                  </div>
                  <span className="font-medium text-slate-800 text-sm">
                    {message.sender_name || message.sender_identifier || "Unknown"}
                  </span>
                  {message.sender_identifier && message.sender_name && (
                    <span className="text-xs text-slate-400">
                      ext. {message.sender_identifier}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    {formatMessageTime(message.sent_at)}
                  </span>
                </div>

                {/* Message text */}
                {message.content && (
                  <p className="text-slate-700 text-sm line-clamp-3">
                    {highlightText(message.content, query)}
                  </p>
                )}

                {/* Media indicator */}
                {message.has_media && message.media_files.length > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                    <span>
                      {message.media_files.length} attachment
                      {message.media_files.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>

              <ArrowRight className="h-4 w-4 text-slate-300 flex-shrink-0 mt-1" />
            </div>
          </Link>
        ))}
      </div>

      {/* Load More */}
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
                Loading...
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
