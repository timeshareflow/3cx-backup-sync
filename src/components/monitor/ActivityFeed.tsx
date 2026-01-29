"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Spinner } from "@/components/ui/Spinner";
import {
  MessageSquare,
  Users,
  Globe,
  RefreshCw,
  Settings,
  Check,
  ChevronDown,
  ChevronUp,
  Send,
  Image,
  File,
  AlertCircle
} from "lucide-react";
import Link from "next/link";

interface FeedMessage {
  id: string;
  conversationId: string;
  conversationName: string;
  isGroupChat: boolean;
  isExternal: boolean;
  senderExtension: string | null;
  senderName: string | null;
  messageText: string | null;
  messageType: string;
  sentAt: string;
  hasMedia: boolean;
}

interface Conversation {
  id: string;
  conversation_name: string | null;
  is_group_chat: boolean;
  is_external: boolean;
  participants: Array<{
    external_id: string | null;
    external_name: string | null;
  }>;
}

interface ActivityFeedProps {
  onConfigureClick?: () => void;
}

export function ActivityFeed({ onConfigureClick }: ActivityFeedProps) {
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [latestTimestamp, setLatestTimestamp] = useState<string | null>(null);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set());
  const [showConfig, setShowConfig] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch available conversations for filtering
  const fetchConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations?limit=100");
      if (response.ok) {
        const data = await response.json();
        setConversations(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    }
  }, []);

  // Fetch messages
  const fetchMessages = useCallback(async (polling = false) => {
    try {
      if (!polling) {
        setIsLoading(true);
      }

      let url = `/api/monitor/feed?limit=50`;

      // Add timestamp for polling
      if (polling && latestTimestamp) {
        url += `&since=${encodeURIComponent(latestTimestamp)}`;
      }

      // Add conversation filter if selected
      if (selectedConversations.size > 0) {
        url += `&conversations=${Array.from(selectedConversations).join(",")}`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }

      const data = await response.json();

      if (polling && data.data.length > 0) {
        // Prepend new messages
        setMessages(prev => [...data.data, ...prev].slice(0, 200)); // Keep max 200 messages
        setNewMessageCount(prev => prev + data.data.length);

        // Auto-clear new message count after 3 seconds
        setTimeout(() => setNewMessageCount(0), 3000);
      } else if (!polling) {
        setMessages(data.data || []);
      }

      if (data.latestTimestamp) {
        setLatestTimestamp(data.latestTimestamp);
      }

      setError(null);
    } catch (err) {
      console.error("Error fetching feed:", err);
      if (!polling) {
        setError("Failed to load messages");
      }
    } finally {
      setIsLoading(false);
    }
  }, [latestTimestamp, selectedConversations]);

  // Initial load
  useEffect(() => {
    fetchMessages();
    fetchConversations();
  }, []);

  // Refetch when filter changes
  useEffect(() => {
    fetchMessages();
  }, [selectedConversations]);

  // Polling for new messages
  useEffect(() => {
    if (isLive) {
      pollIntervalRef.current = setInterval(() => {
        fetchMessages(true);
      }, 5000); // Poll every 5 seconds
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isLive, fetchMessages]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString();
  };

  const toggleMessage = (id: string) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleConversationFilter = (convId: string) => {
    setSelectedConversations(prev => {
      const next = new Set(prev);
      if (next.has(convId)) {
        next.delete(convId);
      } else {
        next.add(convId);
      }
      return next;
    });
  };

  const getConversationIcon = (msg: FeedMessage) => {
    if (msg.isExternal) return <Globe className="h-4 w-4 text-amber-500" />;
    if (msg.isGroupChat) return <Users className="h-4 w-4 text-purple-500" />;
    return <MessageSquare className="h-4 w-4 text-teal-500" />;
  };

  const getMessageIcon = (msg: FeedMessage) => {
    if (msg.hasMedia) {
      if (msg.messageType === "image") return <Image className="h-3 w-3" />;
      return <File className="h-3 w-3" />;
    }
    return null;
  };

  if (isLoading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
        <span className="ml-2 text-gray-500">Loading feed...</span>
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <AlertCircle className="h-8 w-8 mb-2 text-red-400" />
        <p>{error}</p>
        <button
          onClick={() => fetchMessages()}
          className="mt-2 text-teal-600 hover:text-teal-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-800">Activity Feed</h2>
          {newMessageCount > 0 && (
            <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-medium rounded-full animate-pulse">
              {newMessageCount} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Live indicator */}
          <button
            onClick={() => setIsLive(!isLive)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isLive
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isLive ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            {isLive ? "Live" : "Paused"}
          </button>

          {/* Refresh button */}
          <button
            onClick={() => fetchMessages()}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          {/* Config button */}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={`p-2 rounded-lg transition-colors ${
              showConfig || selectedConversations.size > 0
                ? "text-teal-600 bg-teal-50 hover:bg-teal-100"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            }`}
            title="Filter conversations"
          >
            <Settings className="h-4 w-4" />
            {selectedConversations.size > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-teal-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {selectedConversations.size}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showConfig && (
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Filter by Conversation</h3>
            {selectedConversations.size > 0 && (
              <button
                onClick={() => setSelectedConversations(new Set())}
                className="text-xs text-teal-600 hover:text-teal-700"
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => toggleConversationFilter(conv.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                  selectedConversations.has(conv.id)
                    ? "bg-teal-100 text-teal-800"
                    : "hover:bg-white text-slate-700"
                }`}
              >
                {selectedConversations.has(conv.id) ? (
                  <Check className="h-4 w-4 text-teal-600" />
                ) : (
                  <div className="w-4 h-4" />
                )}
                {conv.is_external ? (
                  <Globe className="h-4 w-4 text-amber-500" />
                ) : conv.is_group_chat ? (
                  <Users className="h-4 w-4 text-purple-500" />
                ) : (
                  <MessageSquare className="h-4 w-4 text-teal-500" />
                )}
                <span className="truncate">
                  {conv.conversation_name || conv.participants?.[0]?.external_name || "Unnamed"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <MessageSquare className="h-12 w-12 mb-4 text-gray-300" />
            <p className="text-lg font-medium">No messages yet</p>
            <p className="text-sm">Messages will appear here as they come in</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {messages.map((msg, index) => {
              const isNew = index < newMessageCount;
              const isExpanded = expandedMessages.has(msg.id);

              return (
                <div
                  key={msg.id}
                  className={`p-4 transition-colors ${
                    isNew ? "bg-teal-50" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${
                      msg.isExternal
                        ? "bg-gradient-to-br from-amber-400 to-orange-500"
                        : msg.isGroupChat
                        ? "bg-gradient-to-br from-purple-400 to-violet-500"
                        : "bg-gradient-to-br from-teal-400 to-cyan-500"
                    }`}>
                      {msg.senderName?.charAt(0).toUpperCase() || msg.senderExtension?.charAt(0) || "?"}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-800 truncate">
                          {msg.senderName || msg.senderExtension || "Unknown"}
                        </span>
                        <span className="text-slate-400">→</span>
                        <Link
                          href={`/conversations/${msg.conversationId}`}
                          className="flex items-center gap-1 text-sm text-slate-600 hover:text-teal-600 truncate"
                        >
                          {getConversationIcon(msg)}
                          <span className="truncate">{msg.conversationName}</span>
                        </Link>
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {formatTime(msg.sentAt)}
                        </span>
                      </div>

                      {/* Message text */}
                      <div className={`text-slate-700 ${!isExpanded ? "line-clamp-2" : ""}`}>
                        {msg.hasMedia && (
                          <span className="inline-flex items-center gap-1 text-slate-500 mr-1">
                            {getMessageIcon(msg)}
                          </span>
                        )}
                        {msg.messageText || (msg.hasMedia ? "[Media]" : "[No content]")}
                      </div>

                      {/* Expand/collapse for long messages */}
                      {msg.messageText && msg.messageText.length > 150 && (
                        <button
                          onClick={() => toggleMessage(msg.id)}
                          className="text-xs text-teal-600 hover:text-teal-700 mt-1 flex items-center gap-1"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3 w-3" /> Show less
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3" /> Show more
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Quick actions */}
                    <div className="flex-shrink-0">
                      <Link
                        href={`/conversations/${msg.conversationId}`}
                        className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                        title="Open conversation"
                      >
                        <Send className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer status */}
      <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center justify-between">
        <span>
          Showing {messages.length} messages
          {selectedConversations.size > 0 && ` from ${selectedConversations.size} conversation${selectedConversations.size > 1 ? "s" : ""}`}
        </span>
        {isLive && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            Auto-refreshing every 5s
          </span>
        )}
      </div>
    </div>
  );
}
