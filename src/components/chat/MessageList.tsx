"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageBubble } from "./MessageBubble";
import { Spinner } from "@/components/ui/Spinner";
import { formatDateDivider, isSameDay } from "@/lib/utils/date";
import type { MessageWithMedia } from "@/types";

interface MessageListProps {
  conversationId: string;
  initialMessages?: MessageWithMedia[];
}

export function MessageList({ conversationId, initialMessages }: MessageListProps) {
  const [messages, setMessages] = useState<MessageWithMedia[]>(initialMessages || []);
  const [isLoading, setIsLoading] = useState(!initialMessages);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [oldestTimestamp, setOldestTimestamp] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async (before?: string) => {
    try {
      if (before) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      const url = new URL(`/api/messages`, window.location.origin);
      url.searchParams.set("conversation_id", conversationId);
      url.searchParams.set("limit", "50");
      if (before) {
        url.searchParams.set("before", before);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }

      const data = await response.json();

      if (before) {
        setMessages((prev) => [...data.data, ...prev]);
      } else {
        setMessages(data.data);
        // Scroll to bottom on initial load
        setTimeout(() => {
          bottomRef.current?.scrollIntoView();
        }, 100);
      }

      setHasMore(data.has_more);

      if (data.data.length > 0) {
        setOldestTimestamp(data.data[0].sent_at);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!initialMessages) {
      fetchMessages();
    } else if (initialMessages.length > 0) {
      setOldestTimestamp(initialMessages[0].sent_at);
    }
  }, [conversationId, initialMessages, fetchMessages]);

  const handleScroll = () => {
    if (!containerRef.current || isLoadingMore || !hasMore) return;

    const { scrollTop } = containerRef.current;

    // Load more when scrolled near the top
    if (scrollTop < 200 && oldestTimestamp) {
      fetchMessages(oldestTimestamp);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-600">
        <p>{error}</p>
        <button
          onClick={() => fetchMessages()}
          className="mt-2 text-blue-600 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <p>No messages in this conversation</p>
      </div>
    );
  }

  // Group messages by date
  const messagesWithDividers: Array<{ type: "divider"; date: string } | { type: "message"; message: MessageWithMedia }> = [];

  messages.forEach((message, index) => {
    const prevMessage = messages[index - 1];

    // Add date divider if this is the first message or different day
    if (!prevMessage || !isSameDay(prevMessage.sent_at, message.sent_at)) {
      messagesWithDividers.push({
        type: "divider",
        date: message.sent_at,
      });
    }

    messagesWithDividers.push({
      type: "message",
      message,
    });
  });

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4 space-y-4"
    >
      {isLoadingMore && (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      )}

      {messagesWithDividers.map((item, index) => {
        if (item.type === "divider") {
          return (
            <div key={`divider-${item.date}`} className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-sm text-gray-500 font-medium">
                {formatDateDivider(item.date)}
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          );
        }

        return (
          <MessageBubble
            key={item.message.id}
            message={item.message}
          />
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
