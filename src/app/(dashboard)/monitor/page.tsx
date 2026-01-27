"use client";

import { useState, useEffect, useCallback } from "react";
import { Navigation } from "@/components/layout/Navigation";
import { MessageList } from "@/components/chat/MessageList";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Plus, X, Columns, Maximize2, Minimize2 } from "lucide-react";

interface Conversation {
  id: string;
  conversation_name: string | null;
  is_group_chat: boolean;
  participant_count: number;
  message_count: number;
  last_message_at: string | null;
  participants: Array<{
    id: string;
    external_name: string | null;
    external_id: string | null;
  }>;
}

interface MonitorPanel {
  id: string;
  conversation: Conversation;
  isMaximized: boolean;
}

export default function MonitorPage() {
  const [panels, setPanels] = useState<MonitorPanel[]>([]);
  const [showSelector, setShowSelector] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      const response = await fetch("/api/conversations?limit=100");
      if (response.ok) {
        const data = await response.json();
        setConversations(data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    if (showSelector && conversations.length === 0) {
      fetchConversations();
    }
  }, [showSelector, conversations.length, fetchConversations]);

  const addPanel = (conversation: Conversation) => {
    // Don't add if already in panels
    if (panels.some((p) => p.conversation.id === conversation.id)) {
      return;
    }

    setPanels([
      ...panels,
      {
        id: `panel-${Date.now()}`,
        conversation,
        isMaximized: false,
      },
    ]);
    setShowSelector(false);
  };

  const removePanel = (panelId: string) => {
    setPanels(panels.filter((p) => p.id !== panelId));
  };

  const toggleMaximize = (panelId: string) => {
    setPanels(
      panels.map((p) =>
        p.id === panelId ? { ...p, isMaximized: !p.isMaximized } : p
      )
    );
  };

  const getConversationTitle = (conv: Conversation) => {
    if (conv.conversation_name) return conv.conversation_name;
    const names = conv.participants
      ?.map((p) => p.external_name || p.external_id)
      .filter(Boolean)
      .join(", ");
    return names || "Unnamed Conversation";
  };

  const filteredConversations = conversations.filter((conv) => {
    const title = getConversationTitle(conv).toLowerCase();
    return title.includes(searchTerm.toLowerCase());
  });

  // Get available conversations (not already in panels)
  const availableConversations = filteredConversations.filter(
    (conv) => !panels.some((p) => p.conversation.id === conv.id)
  );

  // Check if any panel is maximized
  const maximizedPanel = panels.find((p) => p.isMaximized);

  // Calculate grid columns based on panel count
  const getGridCols = () => {
    if (panels.length <= 1) return "grid-cols-1";
    if (panels.length === 2) return "grid-cols-2";
    if (panels.length <= 4) return "grid-cols-2";
    return "grid-cols-3";
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <Navigation
        breadcrumbs={[{ label: "Multi-Chat Monitor" }]}
      />

      {/* Header with controls */}
      <div className="bg-white rounded-lg shadow mb-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Multi-Chat Monitor
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              View multiple conversations simultaneously
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 flex items-center gap-1">
              <Columns className="h-4 w-4" />
              {panels.length} active
            </span>
            <Button
              onClick={() => setShowSelector(true)}
              className="flex items-center gap-2"
              disabled={showSelector}
            >
              <Plus className="h-4 w-4" />
              Add Conversation
            </Button>
          </div>
        </div>
      </div>

      {/* Conversation Selector Modal */}
      {showSelector && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Select Conversation</h2>
              <button
                onClick={() => setShowSelector(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 border-b">
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {isLoadingConversations ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="lg" />
                </div>
              ) : availableConversations.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {searchTerm
                    ? "No matching conversations found"
                    : "All conversations are already being monitored"}
                </div>
              ) : (
                <div className="space-y-1">
                  {availableConversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => addPanel(conv)}
                      className="w-full text-left px-3 py-3 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <div className="font-medium text-gray-900">
                        {getConversationTitle(conv)}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                        <span>{conv.participant_count} participants</span>
                        <span>•</span>
                        <span>{conv.message_count} messages</span>
                        {conv.is_group_chat && (
                          <>
                            <span>•</span>
                            <span className="text-teal-600">Group</span>
                          </>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chat Panels */}
      {panels.length === 0 ? (
        <div className="flex-1 bg-white rounded-lg shadow flex items-center justify-center">
          <div className="text-center">
            <Columns className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No conversations selected
            </h3>
            <p className="text-gray-500 mb-4">
              Click &quot;Add Conversation&quot; to start monitoring chats
            </p>
            <Button onClick={() => setShowSelector(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Conversation
            </Button>
          </div>
        </div>
      ) : maximizedPanel ? (
        // Show only maximized panel
        <div className="flex-1 bg-white rounded-lg shadow overflow-hidden flex flex-col">
          <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
            <h3 className="font-medium text-gray-900 truncate">
              {getConversationTitle(maximizedPanel.conversation)}
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => toggleMaximize(maximizedPanel.id)}
                className="p-1.5 hover:bg-gray-200 rounded"
                title="Minimize"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => removePanel(maximizedPanel.id)}
                className="p-1.5 hover:bg-red-100 text-red-600 rounded"
                title="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto min-h-0">
            <MessageList conversationId={maximizedPanel.conversation.id} />
          </div>
        </div>
      ) : (
        // Show grid of panels
        <div className={`flex-1 grid ${getGridCols()} gap-4 overflow-auto`}>
          {panels.map((panel) => (
            <div
              key={panel.id}
              className="bg-white rounded-lg shadow overflow-hidden flex flex-col min-h-0"
            >
              <div className="p-3 border-b bg-gray-50 flex items-center justify-between shrink-0">
                <h3 className="font-medium text-gray-900 truncate text-sm">
                  {getConversationTitle(panel.conversation)}
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleMaximize(panel.id)}
                    className="p-1 hover:bg-gray-200 rounded"
                    title="Maximize"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removePanel(panel.id)}
                    className="p-1 hover:bg-red-100 text-red-600 rounded"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto min-h-0">
                <MessageList conversationId={panel.conversation.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
