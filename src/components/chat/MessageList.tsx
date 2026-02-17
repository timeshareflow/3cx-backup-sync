"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { MessageBubble } from "./MessageBubble";
import { Spinner } from "@/components/ui/Spinner";
import { formatDateDivider, isSameDay } from "@/lib/utils/date";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import type { MessageWithMedia } from "@/types";

const POLL_INTERVAL = 5000; // Poll every 5 seconds for new messages

interface MessageListProps {
  conversationId: string;
  initialMessages?: MessageWithMedia[];
  loadAll?: boolean; // If true, automatically loads all messages for full history access
  enablePolling?: boolean; // If true, polls for new messages (default: true)
}

export function MessageList({ conversationId, initialMessages, loadAll = false, enablePolling = true }: MessageListProps) {
  const [messages, setMessages] = useState<MessageWithMedia[]>(initialMessages || []);
  const [isLoading, setIsLoading] = useState(!initialMessages);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [oldestTimestamp, setOldestTimestamp] = useState<string | null>(null);
  const [newestTimestamp, setNewestTimestamp] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isNearBottomRef = useRef(true);
  const newestTimestampRef = useRef<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    newestTimestampRef.current = newestTimestamp;
  }, [newestTimestamp]);

  const fetchMessages = useCallback(async (before?: string, isPolling?: boolean) => {
    try {
      if (before) {
        setIsLoadingMore(true);
      } else if (!isPolling) {
        setIsLoading(true);
      }

      const url = new URL(`/api/messages`, window.location.origin);
      url.searchParams.set("conversation_id", conversationId);
      url.searchParams.set("limit", "50");
      if (before) {
        url.searchParams.set("before", before);
      } else {
        // Initial load: get the latest messages
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
        // Scroll to bottom on initial load
        if (!isPolling) {
          setTimeout(() => {
            bottomRef.current?.scrollIntoView();
          }, 100);
        }
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
  }, [conversationId]);

  useEffect(() => {
    if (!initialMessages) {
      fetchMessages();
    } else if (initialMessages.length > 0) {
      setOldestTimestamp(initialMessages[0].sent_at);
    }
  }, [conversationId, initialMessages, fetchMessages]);

  // Auto-load all messages when loadAll is true
  useEffect(() => {
    if (loadAll && hasMore && !isLoadingMore && !isLoading && oldestTimestamp) {
      fetchMessages(oldestTimestamp);
    }
  }, [loadAll, hasMore, isLoadingMore, isLoading, oldestTimestamp, fetchMessages]);

  // Poll for new messages
  const pollForNewMessages = useCallback(async () => {
    if (!newestTimestamp) return;

    try {
      const url = new URL(`/api/messages`, window.location.origin);
      url.searchParams.set("conversation_id", conversationId);
      url.searchParams.set("after", newestTimestamp);
      url.searchParams.set("limit", "50");

      const response = await fetch(url.toString());

      if (!response.ok) return;

      const data = await response.json();

      if (data.data && data.data.length > 0) {
        setMessages((prev) => [...prev, ...data.data]);

        // Update newest timestamp
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
      // Silently fail for polling - don't show errors
      console.debug("Polling error:", err);
    }
  }, [conversationId, newestTimestamp]);

  // Set up polling interval
  useEffect(() => {
    if (!enablePolling || !newestTimestamp) return;

    pollIntervalRef.current = setInterval(pollForNewMessages, POLL_INTERVAL);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [enablePolling, newestTimestamp, pollForNewMessages]);

  // Track if user is near bottom of scroll
  const checkIfNearBottom = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
  };

  const handleScroll = () => {
    checkIfNearBottom();
    if (!containerRef.current || isLoadingMore || !hasMore) return;

    const { scrollTop } = containerRef.current;

    // Load more when scrolled near the top
    if (scrollTop < 200 && oldestTimestamp) {
      fetchMessages(oldestTimestamp);
    }
  };

  // Search: find matching message IDs
  const matchingMessageIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(
      messages
        .filter(
          (m) =>
            m.content?.toLowerCase().includes(q) ||
            m.sender_name?.toLowerCase().includes(q) ||
            m.sender_identifier?.toLowerCase().includes(q)
        )
        .map((m) => m.id)
    );
  }, [messages, searchQuery]);

  const matchingIds = useMemo(
    () => Array.from(matchingMessageIds),
    [matchingMessageIds]
  );

  // Scroll to active match
  useEffect(() => {
    if (matchingIds.length === 0 || !containerRef.current) return;
    const id = matchingIds[activeMatchIndex];
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeMatchIndex, matchingIds]);

  // Reset active match when query changes
  useEffect(() => {
    setActiveMatchIndex(0);
  }, [searchQuery]);

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
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Search Bar */}
      <div className="shrink-0 border-b border-gray-100">
        {!showSearch ? (
          <div className="flex justify-end px-3 py-1.5">
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              Search
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              type="text"
              autoFocus
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-0 text-sm bg-transparent text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            {searchQuery && matchingIds.length > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-slate-500 tabular-nums">
                  {activeMatchIndex + 1}/{matchingIds.length}
                </span>
                <button
                  onClick={() =>
                    setActiveMatchIndex((i) =>
                      i > 0 ? i - 1 : matchingIds.length - 1
                    )
                  }
                  className="p-0.5 hover:bg-slate-200 rounded"
                >
                  <ChevronUp className="h-4 w-4 text-slate-500" />
                </button>
                <button
                  onClick={() =>
                    setActiveMatchIndex((i) =>
                      i < matchingIds.length - 1 ? i + 1 : 0
                    )
                  }
                  className="p-0.5 hover:bg-slate-200 rounded"
                >
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </button>
              </div>
            )}
            {searchQuery && matchingIds.length === 0 && (
              <span className="text-xs text-slate-400 shrink-0">No results</span>
            )}
            <button
              onClick={() => {
                setShowSearch(false);
                setSearchQuery("");
              }}
              className="p-0.5 hover:bg-slate-200 rounded shrink-0"
            >
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4"
      >
        {isLoadingMore && (
          <div className="flex justify-center items-center gap-2 py-4">
            <Spinner size="sm" />
            {loadAll && hasMore && (
              <span className="text-sm text-gray-500">Loading full history...</span>
            )}
          </div>
        )}

        {messagesWithDividers.map((item) => {
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

          const isMatch = matchingMessageIds.has(item.message.id);
          const isActive = isMatch && matchingIds[activeMatchIndex] === item.message.id;

          return (
            <div key={item.message.id} id={`msg-${item.message.id}`}>
              <MessageBubble
                message={item.message}
                isHighlighted={isActive}
              />
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
