"use client";

import { useState, useEffect } from "react";
import { ConversationItem } from "./ConversationItem";
import { Spinner } from "@/components/ui/Spinner";
import type { ConversationWithParticipants } from "@/types";

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

  useEffect(() => {
    if (!initialConversations) {
      fetchConversations();
    }
  }, [initialConversations]);

  const fetchConversations = async (pageNum: number = 1) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/conversations?page=${pageNum}&limit=20`);

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
    <div className="divide-y divide-gray-200">
      {conversations.map((conversation) => (
        <ConversationItem key={conversation.id} conversation={conversation} />
      ))}

      {hasMore && (
        <div className="p-4 text-center">
          <button
            onClick={loadMore}
            disabled={isLoading}
            className="text-blue-600 hover:underline disabled:opacity-50"
          >
            {isLoading ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
