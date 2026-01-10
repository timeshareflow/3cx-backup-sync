"use client";

import Link from "next/link";
import { MessageSquare, ArrowRight } from "lucide-react";
import { formatMessageTime } from "@/lib/utils/date";
import { Spinner } from "@/components/ui/Spinner";
import type { MessageWithMedia, Conversation } from "@/types";

interface SearchResultsProps {
  results: Array<MessageWithMedia & { conversation?: Conversation }>;
  isLoading: boolean;
  query: string;
  totalCount?: number;
}

export function SearchResults({
  results,
  isLoading,
  query,
  totalCount,
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
      <div className="text-center py-12 text-gray-500">
        <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p className="text-lg">Enter a search term to find messages</p>
        <p className="text-sm mt-1">
          Search through all archived conversations
        </p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p className="text-lg">No results found for &quot;{query}&quot;</p>
        <p className="text-sm mt-1">Try different keywords or adjust filters</p>
      </div>
    );
  }

  const highlightText = (text: string, searchQuery: string) => {
    if (!searchQuery || !text) return text;

    try {
      const parts = text.split(new RegExp(`(${searchQuery})`, "gi"));
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

  return (
    <div>
      {totalCount !== undefined && (
        <p className="text-sm text-gray-500 mb-4">
          Found {totalCount.toLocaleString()} result{totalCount !== 1 ? "s" : ""}
        </p>
      )}

      <div className="space-y-4">
        {results.map((message) => (
          <Link
            key={message.id}
            href={`/conversations/${message.conversation_id}?highlight=${message.id}`}
            className="block bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                {/* Sender and time */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-gray-900">
                    {message.sender_name || message.sender_identifier || "Unknown"}
                  </span>
                  {message.sender_identifier && message.sender_name && (
                    <span className="text-xs text-gray-500">
                      ext. {message.sender_identifier}
                    </span>
                  )}
                  <span className="text-sm text-gray-400">
                    {formatMessageTime(message.sent_at)}
                  </span>
                </div>

                {/* Message text */}
                <p className="text-gray-700 line-clamp-3">
                  {highlightText(message.content || "", query)}
                </p>

                {/* Media indicator */}
                {message.has_media && message.media_files.length > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-sm text-gray-500">
                    <span>
                      {message.media_files.length} attachment
                      {message.media_files.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>

              <ArrowRight className="h-5 w-5 text-gray-400 flex-shrink-0 ml-4" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
