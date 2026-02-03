"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageBubble } from "./MessageBubble";
import { Spinner } from "@/components/ui/Spinner";
import { formatDateDivider, isSameDay } from "@/lib/utils/date";
import { Users, Globe, MessageSquare } from "lucide-react";
import type { MessageWithMedia } from "@/types";

const POLL_INTERVAL = 5000;

interface ExtensionMessage extends MessageWithMedia {
  conversation_name: string;
  is_group_chat: boolean;
  is_external: boolean;
}

interface ExtensionMessageListProps {
  extensionId: string;
}

export function ExtensionMessageList({ extensionId }: ExtensionMessageListProps) {
  const [messages, setMessages] = useState<ExtensionMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [oldestTimestamp, setOldestTimestamp] = useState<string | null>(null);
  const [newestTimestamp, setNewestTimestamp] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isNearBottomRef = useRef(true);
  const initialScrollDone = useRef(false);

  const fetchMessages = useCallback(async (before?: string, isPolling?: boolean) => {
    try {
      if (before) {
        setIsLoadingMore(true);
      } else if (!isPolling) {
        setIsLoading(true);
      }

      const url = new URL("/api/messages/by-extension", window.location.origin);
      url.searchParams.set("extension_id", extensionId);
      url.searchParams.set("limit", "50");
      if (before) {
        url.searchParams.set("before", before);
      } else {
        url.searchParams.set("latest", "true");
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
      }

      setHasMore(data.has_more);

      if (data.data.length > 0) {
        setOldestTimestamp(data.data[0].sent_at);
        setNewestTimestamp(data.data[data.data.length - 1].sent_at);
      }
    } catch (err) {
      if (!isPolling) {
        setError(err instanceof Error ? err.message : "An error occurred");
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [extensionId]);

  // Initial load
  useEffect(() => {
    initialScrollDone.current = false;
    fetchMessages();
  }, [extensionId, fetchMessages]);

  // Scroll to bottom after initial load
  useEffect(() => {
    if (!isLoading && messages.length > 0 && !initialScrollDone.current) {
      initialScrollDone.current = true;
      setTimeout(() => {
        bottomRef.current?.scrollIntoView();
      }, 100);
    }
  }, [isLoading, messages.length]);

  // Poll for new messages
  const pollForNewMessages = useCallback(async () => {
    if (!newestTimestamp) return;

    try {
      const url = new URL("/api/messages/by-extension", window.location.origin);
      url.searchParams.set("extension_id", extensionId);
      url.searchParams.set("after", newestTimestamp);
      url.searchParams.set("limit", "50");

      const response = await fetch(url.toString());

      if (!response.ok) return;

      const data = await response.json();

      if (data.data && data.data.length > 0) {
        setMessages((prev) => [...prev, ...data.data]);

        const latestMsg = data.data[data.data.length - 1];
        if (latestMsg) {
          setNewestTimestamp(latestMsg.sent_at);
        }

        // Auto-scroll to bottom if user was near bottom
        if (isNearBottomRef.current) {
          setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 100);
        }
      }
    } catch (err) {
      console.debug("Polling error:", err);
    }
  }, [extensionId, newestTimestamp]);

  // Set up polling
  useEffect(() => {
    if (!newestTimestamp) return;

    pollIntervalRef.current = setInterval(pollForNewMessages, POLL_INTERVAL);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [newestTimestamp, pollForNewMessages]);

  // Track if user is near bottom
  const checkIfNearBottom = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
  };

  const handleScroll = () => {
    checkIfNearBottom();
    if (!containerRef.current || isLoadingMore || !hasMore) return;

    const { scrollTop } = containerRef.current;
    if (scrollTop < 200 && oldestTimestamp) {
      fetchMessages(oldestTimestamp);
    }
  };

  const getConversationIcon = (msg: ExtensionMessage) => {
    if (msg.is_external) return <Globe className="h-3 w-3 text-amber-500" />;
    if (msg.is_group_chat) return <Users className="h-3 w-3 text-purple-500" />;
    return <MessageSquare className="h-3 w-3 text-teal-500" />;
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
        <p>No messages for this extension</p>
      </div>
    );
  }

  // Group messages by date, with conversation labels when conversation changes
  const items: Array<
    | { type: "divider"; date: string }
    | { type: "conversation-label"; name: string; conversationId: string; isGroupChat: boolean; isExternal: boolean }
    | { type: "message"; message: ExtensionMessage }
  > = [];

  let lastConversationId: string | null = null;

  messages.forEach((message, index) => {
    const prevMessage = messages[index - 1];

    // Add date divider if needed
    if (!prevMessage || !isSameDay(prevMessage.sent_at, message.sent_at)) {
      items.push({ type: "divider", date: message.sent_at });
      lastConversationId = null; // Reset conversation label after date divider
    }

    // Add conversation label when conversation changes
    if (message.conversation_id !== lastConversationId) {
      items.push({
        type: "conversation-label",
        name: message.conversation_name,
        conversationId: message.conversation_id,
        isGroupChat: message.is_group_chat,
        isExternal: message.is_external,
      });
      lastConversationId = message.conversation_id;
    }

    items.push({ type: "message", message });
  });

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2"
    >
      {isLoadingMore && (
        <div className="flex justify-center items-center gap-2 py-4">
          <Spinner size="sm" />
        </div>
      )}

      {items.map((item, index) => {
        if (item.type === "divider") {
          return (
            <div key={`divider-${item.date}-${index}`} className="flex items-center gap-4 my-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-500 font-medium">
                {formatDateDivider(item.date)}
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          );
        }

        if (item.type === "conversation-label") {
          return (
            <div
              key={`conv-${item.conversationId}-${index}`}
              className="flex items-center gap-2 px-2 py-1 mt-2"
            >
              {item.isExternal ? (
                <Globe className="h-3.5 w-3.5 text-amber-500" />
              ) : item.isGroupChat ? (
                <Users className="h-3.5 w-3.5 text-purple-500" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5 text-teal-500" />
              )}
              <span className="text-xs font-medium text-gray-500 truncate">
                {item.name}
              </span>
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
