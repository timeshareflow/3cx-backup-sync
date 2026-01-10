"use client";

import { useState, useEffect, useMemo } from "react";
import { ConversationCard } from "./ConversationItem";
import { Spinner } from "@/components/ui/Spinner";
import { ArrowUpDown, Clock, MessageSquare, User } from "lucide-react";
import type { ConversationWithParticipants } from "@/types";

type SortOption = "recent" | "name" | "messages" | "oldest";

interface ConversationListProps {
  initialConversations?: ConversationWithParticipants[];
}

export function ConversationList({ initialConversations }: ConversationListProps) {
  const [conversations, setConversations] = useState<ConversationWithParticipants[]>(
    initialConversations || []
  );
  const [isLoading, setIsLoading] = useState(!initialConversations);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>("recent");

  useEffect(() => {
    if (!initialConversations) {
      fetchConversations();
    }
  }, [initialConversations]);

  const fetchConversations = async (pageNum: number = 1) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/conversations?page=${pageNum}&limit=50`);

      if (!response.ok) {
        throw new Error("Failed to fetch conversations");
      }

      const data = await response.json();

      if (pageNum === 1) {
        setConversations(data.data);
      } else {
        setConversations((prev) => [...prev, ...data.data]);
      }

      setHasMore(data.has_more);
      setPage(pageNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const sortedConversations = useMemo(() => {
    const sorted = [...conversations];
    switch (sortBy) {
      case "recent":
        return sorted.sort((a, b) => {
          const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return bTime - aTime;
        });
      case "oldest":
        return sorted.sort((a, b) => {
          const aTime = a.first_message_at ? new Date(a.first_message_at).getTime() : 0;
          const bTime = b.first_message_at ? new Date(b.first_message_at).getTime() : 0;
          return aTime - bTime;
        });
      case "name":
        return sorted.sort((a, b) => {
          const aName = a.conversation_name || a.participants[0]?.display_name || "";
          const bName = b.conversation_name || b.participants[0]?.display_name || "";
          return aName.localeCompare(bName);
        });
      case "messages":
        return sorted.sort((a, b) => b.message_count - a.message_count);
      default:
        return sorted;
    }
  }, [conversations, sortBy]);

  const loadMore = () => {
    if (!isLoading && hasMore) {
      fetchConversations(page + 1);
    }
  };

  if (error) {
    return (
      <div className="p-4 text-center text-red-600">
        <p>{error}</p>
        <button
          onClick={() => fetchConversations()}
          className="mt-2 text-blue-600 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (isLoading && conversations.length === 0) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>No conversations found</p>
        <p className="text-sm mt-1">
          Conversations will appear here once the sync service starts running.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Sort Controls */}
      <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-200">
        <ArrowUpDown className="h-4 w-4 text-slate-500" />
        <span className="text-sm text-slate-600 font-medium">Sort by:</span>
        <div className="flex gap-1">
          <button
            onClick={() => setSortBy("recent")}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              sortBy === "recent"
                ? "bg-teal-100 text-teal-700 font-medium"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Recent
          </button>
          <button
            onClick={() => setSortBy("name")}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              sortBy === "name"
                ? "bg-teal-100 text-teal-700 font-medium"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <User className="h-3.5 w-3.5" />
            Name
          </button>
          <button
            onClick={() => setSortBy("messages")}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              sortBy === "messages"
                ? "bg-teal-100 text-teal-700 font-medium"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Messages
          </button>
          <button
            onClick={() => setSortBy("oldest")}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              sortBy === "oldest"
                ? "bg-teal-100 text-teal-700 font-medium"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Oldest
          </button>
        </div>
        <span className="ml-auto text-sm text-slate-500">
          {conversations.length} conversations
        </span>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {sortedConversations.map((conversation) => (
          <ConversationCard key={conversation.id} conversation={conversation} />
        ))}
      </div>

      {hasMore && (
        <div className="p-4 text-center mt-4">
          <button
            onClick={loadMore}
            disabled={isLoading}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
          >
            {isLoading ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
