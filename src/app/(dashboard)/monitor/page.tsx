"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Navigation } from "@/components/layout/Navigation";
import { ExtensionMessageList } from "@/components/chat/ExtensionMessageList";
import { MessageList } from "@/components/chat/MessageList";
import { ActivityFeed } from "@/components/monitor/ActivityFeed";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Plus, X, Columns, Maximize2, Minimize2, LayoutGrid, List, Phone, Users } from "lucide-react";

interface Extension {
  id: string;
  extension_number: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
}

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

type PanelType = "extension" | "group";

interface MonitorPanel {
  id: string;
  type: PanelType;
  extension?: Extension;
  conversation?: Conversation;
  isMaximized: boolean;
}

type ViewMode = "grid" | "feed";
type SelectorTab = "extensions" | "groups";

export default function MonitorPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [panels, setPanels] = useState<MonitorPanel[]>([]);
  const [showSelector, setShowSelector] = useState(false);
  const [selectorTab, setSelectorTab] = useState<SelectorTab>("extensions");
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [groupChats, setGroupChats] = useState<Conversation[]>([]);
  const [isLoadingSelector, setIsLoadingSelector] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const initialLoadDone = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Save panel config to user preferences (debounced)
  const saveMonitorPreferences = useCallback((currentPanels: MonitorPanel[], mode?: ViewMode) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const monitorExtensionIds = currentPanels
          .filter((p) => p.type === "extension" && p.extension)
          .map((p) => p.extension!.id);
        const monitorGroupChatIds = currentPanels
          .filter((p) => p.type === "group" && p.conversation)
          .map((p) => p.conversation!.id);

        const body: Record<string, unknown> = {
          monitorExtensionIds,
          monitorGroupChatIds,
        };
        if (mode !== undefined) {
          body.monitorViewMode = mode;
        }
        await fetch("/api/user/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (error) {
        console.error("Failed to save monitor preferences:", error);
      }
    }, 500);
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    saveMonitorPreferences(panels, mode);
  }, [panels, saveMonitorPreferences]);

  const fetchExtensions = useCallback(async (): Promise<Extension[]> => {
    try {
      const response = await fetch("/api/extensions");
      if (response.ok) {
        const data = await response.json();
        setExtensions(data || []);
        return data || [];
      }
    } catch (error) {
      console.error("Failed to fetch extensions:", error);
    }
    return [];
  }, []);

  const fetchGroupChats = useCallback(async (): Promise<Conversation[]> => {
    try {
      const response = await fetch("/api/conversations?limit=100");
      if (response.ok) {
        const data = await response.json();
        const groups = (data.data || []).filter((c: Conversation) => c.is_group_chat);
        setGroupChats(groups);
        return groups;
      }
    } catch (error) {
      console.error("Failed to fetch group chats:", error);
    }
    return [];
  }, []);

  // Load saved monitor preferences on mount
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    (async () => {
      try {
        const [prefsResponse, extList, groupList] = await Promise.all([
          fetch("/api/user/preferences"),
          fetchExtensions(),
          fetchGroupChats(),
        ]);

        if (prefsResponse.ok) {
          const prefsData = await prefsResponse.json();
          const savedExtIds: string[] =
            prefsData.preferences?.monitorExtensionIds || [];
          const savedGroupIds: string[] =
            prefsData.preferences?.monitorGroupChatIds || [];
          const savedViewMode: ViewMode =
            prefsData.preferences?.monitorViewMode || "grid";

          setViewMode(savedViewMode);

          const savedPanels: MonitorPanel[] = [];

          // Restore extension panels
          for (const id of savedExtIds) {
            const ext = extList.find((e: Extension) => e.id === id);
            if (ext) {
              savedPanels.push({
                id: `panel-ext-${id}`,
                type: "extension",
                extension: ext,
                isMaximized: false,
              });
            }
          }

          // Restore group chat panels
          for (const id of savedGroupIds) {
            const conv = groupList.find((c: Conversation) => c.id === id);
            if (conv) {
              savedPanels.push({
                id: `panel-grp-${id}`,
                type: "group",
                conversation: conv,
                isMaximized: false,
              });
            }
          }

          setPanels(savedPanels);
        }
      } catch (error) {
        console.error("Failed to load monitor preferences:", error);
      } finally {
        setIsLoadingInitial(false);
      }
    })();
  }, [fetchExtensions, fetchGroupChats]);

  // Fetch data when selector opens
  useEffect(() => {
    if (showSelector) {
      setIsLoadingSelector(true);
      Promise.all([
        extensions.length === 0 ? fetchExtensions() : Promise.resolve(extensions),
        groupChats.length === 0 ? fetchGroupChats() : Promise.resolve(groupChats),
      ]).finally(() => setIsLoadingSelector(false));
    }
  }, [showSelector, extensions.length, groupChats.length, fetchExtensions, fetchGroupChats]);

  const addExtensionPanel = (extension: Extension) => {
    if (panels.some((p) => p.type === "extension" && p.extension?.id === extension.id)) {
      return;
    }

    const newPanels = [
      ...panels,
      {
        id: `panel-ext-${Date.now()}`,
        type: "extension" as PanelType,
        extension,
        isMaximized: false,
      },
    ];
    setPanels(newPanels);
    setShowSelector(false);
    setSearchTerm("");
    saveMonitorPreferences(newPanels);
  };

  const addGroupPanel = (conversation: Conversation) => {
    if (panels.some((p) => p.type === "group" && p.conversation?.id === conversation.id)) {
      return;
    }

    const newPanels = [
      ...panels,
      {
        id: `panel-grp-${Date.now()}`,
        type: "group" as PanelType,
        conversation,
        isMaximized: false,
      },
    ];
    setPanels(newPanels);
    setShowSelector(false);
    setSearchTerm("");
    saveMonitorPreferences(newPanels);
  };

  const removePanel = (panelId: string) => {
    const newPanels = panels.filter((p) => p.id !== panelId);
    setPanels(newPanels);
    saveMonitorPreferences(newPanels);
  };

  const toggleMaximize = (panelId: string) => {
    setPanels(
      panels.map((p) =>
        p.id === panelId ? { ...p, isMaximized: !p.isMaximized } : p
      )
    );
  };

  const getExtensionTitle = (ext: Extension) => {
    const name = ext.display_name ||
      [ext.first_name, ext.last_name].filter(Boolean).join(" ") ||
      ext.extension_number;
    return `${name} (${ext.extension_number})`;
  };

  const getGroupTitle = (conv: Conversation) => {
    return conv.conversation_name || "Unnamed Group";
  };

  const getPanelTitle = (panel: MonitorPanel) => {
    if (panel.type === "extension" && panel.extension) {
      return getExtensionTitle(panel.extension);
    }
    if (panel.type === "group" && panel.conversation) {
      return getGroupTitle(panel.conversation);
    }
    return "Unknown";
  };

  const getPanelIcon = (panel: MonitorPanel) => {
    if (panel.type === "group") {
      return <Users className="h-3.5 w-3.5 text-purple-500" />;
    }
    return <Phone className="h-3.5 w-3.5 text-teal-600" />;
  };

  // Filter for selector
  const filteredExtensions = extensions.filter((ext) => {
    const title = getExtensionTitle(ext).toLowerCase();
    return title.includes(searchTerm.toLowerCase());
  });
  const availableExtensions = filteredExtensions.filter(
    (ext) => !panels.some((p) => p.type === "extension" && p.extension?.id === ext.id)
  );

  const filteredGroups = groupChats.filter((conv) => {
    const title = getGroupTitle(conv).toLowerCase();
    return title.includes(searchTerm.toLowerCase());
  });
  const availableGroups = filteredGroups.filter(
    (conv) => !panels.some((p) => p.type === "group" && p.conversation?.id === conv.id)
  );

  const maximizedPanel = panels.find((p) => p.isMaximized);

  const getGridCols = () => {
    if (panels.length <= 1) return "grid-cols-1";
    if (panels.length === 2) return "grid-cols-2";
    if (panels.length <= 4) return "grid-cols-2";
    return "grid-cols-3";
  };

  if (isLoadingInitial) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <Navigation breadcrumbs={[{ label: "Multi-Chat Monitor" }]} />
        <div className="flex-1 flex items-center justify-center">
          <Spinner size="lg" />
          <span className="ml-3 text-gray-600">Loading monitor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <Navigation breadcrumbs={[{ label: "Multi-Chat Monitor" }]} />

      {/* Header */}
      <div className="bg-white rounded-lg shadow mb-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Multi-Chat Monitor</h1>
            <p className="text-sm text-gray-500 mt-1">
              {viewMode === "grid"
                ? "Monitor extensions and group chats"
                : "Live activity feed from all conversations"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => handleViewModeChange("grid")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === "grid"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                title="Grid View"
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">Grid</span>
              </button>
              <button
                onClick={() => handleViewModeChange("feed")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === "feed"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                title="Feed View"
              >
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">Feed</span>
              </button>
            </div>

            {viewMode === "grid" && (
              <>
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <Columns className="h-4 w-4" />
                  {panels.length} active
                </span>
                <Button
                  onClick={() => { setShowSelector(true); setSearchTerm(""); }}
                  className="flex items-center gap-2"
                  disabled={showSelector}
                >
                  <Plus className="h-4 w-4" />
                  Add Monitor
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Selector Modal */}
      {showSelector && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Add to Monitor</h2>
              <button
                onClick={() => setShowSelector(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b">
              <button
                onClick={() => { setSelectorTab("extensions"); setSearchTerm(""); }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  selectorTab === "extensions"
                    ? "text-teal-600 border-b-2 border-teal-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Phone className="h-4 w-4" />
                Extensions
              </button>
              <button
                onClick={() => { setSelectorTab("groups"); setSearchTerm(""); }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  selectorTab === "groups"
                    ? "text-purple-600 border-b-2 border-purple-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Users className="h-4 w-4" />
                Group Chats
              </button>
            </div>

            {/* Search */}
            <div className="p-4 border-b">
              <input
                type="text"
                placeholder={selectorTab === "extensions" ? "Search extensions..." : "Search group chats..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-900 placeholder-gray-400 bg-white"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2">
              {isLoadingSelector ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="lg" />
                </div>
              ) : selectorTab === "extensions" ? (
                availableExtensions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    {searchTerm
                      ? "No matching extensions found"
                      : "All extensions are already being monitored"}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {availableExtensions.map((ext) => (
                      <button
                        key={ext.id}
                        onClick={() => addExtensionPanel(ext)}
                        className="w-full text-left px-3 py-3 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                            <Phone className="h-4 w-4 text-teal-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              {getExtensionTitle(ext)}
                            </div>
                            <div className="text-sm text-gray-500">
                              All direct messages
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                availableGroups.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    {searchTerm
                      ? "No matching group chats found"
                      : "All group chats are already being monitored"}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {availableGroups.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => addGroupPanel(conv)}
                        className="w-full text-left px-3 py-3 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                            <Users className="h-4 w-4 text-purple-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              {getGroupTitle(conv)}
                            </div>
                            <div className="text-sm text-gray-500">
                              {conv.participant_count} participants &middot; {conv.message_count} messages
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {viewMode === "feed" ? (
        <div className="flex-1 bg-white rounded-lg shadow overflow-hidden">
          <ActivityFeed />
        </div>
      ) : (
        <>
          {panels.length === 0 ? (
            <div className="flex-1 bg-white rounded-lg shadow flex items-center justify-center">
              <div className="text-center">
                <Columns className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No monitors active
                </h3>
                <p className="text-gray-500 mb-4">
                  Add extensions or group chats to start monitoring
                </p>
                <Button onClick={() => setShowSelector(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Monitor
                </Button>
              </div>
            </div>
          ) : maximizedPanel ? (
            <div className="flex-1 bg-white rounded-lg shadow overflow-hidden flex flex-col">
              <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
                <h3 className="font-medium text-gray-900 truncate flex items-center gap-2">
                  {maximizedPanel.type === "group" ? (
                    <Users className="h-4 w-4 text-purple-500" />
                  ) : (
                    <Phone className="h-4 w-4 text-teal-600" />
                  )}
                  {getPanelTitle(maximizedPanel)}
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
                {maximizedPanel.type === "extension" && maximizedPanel.extension ? (
                  <ExtensionMessageList extensionId={maximizedPanel.extension.id} />
                ) : maximizedPanel.type === "group" && maximizedPanel.conversation ? (
                  <MessageList conversationId={maximizedPanel.conversation.id} />
                ) : null}
              </div>
            </div>
          ) : (
            <div className={`flex-1 grid ${getGridCols()} gap-4 overflow-auto`}>
              {panels.map((panel) => (
                <div
                  key={panel.id}
                  className="bg-white rounded-lg shadow overflow-hidden flex flex-col min-h-0"
                >
                  <div className="p-3 border-b bg-gray-50 flex items-center justify-between shrink-0">
                    <h3 className="font-medium text-gray-900 truncate text-sm flex items-center gap-2">
                      {getPanelIcon(panel)}
                      {getPanelTitle(panel)}
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
                    {panel.type === "extension" && panel.extension ? (
                      <ExtensionMessageList extensionId={panel.extension.id} />
                    ) : panel.type === "group" && panel.conversation ? (
                      <MessageList conversationId={panel.conversation.id} />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
