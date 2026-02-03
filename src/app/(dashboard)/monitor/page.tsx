"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Navigation } from "@/components/layout/Navigation";
import { ExtensionMessageList } from "@/components/chat/ExtensionMessageList";
import { ActivityFeed } from "@/components/monitor/ActivityFeed";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Plus, X, Columns, Maximize2, Minimize2, LayoutGrid, List, Phone } from "lucide-react";

interface Extension {
  id: string;
  extension_number: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
}

interface MonitorPanel {
  id: string;
  extension: Extension;
  isMaximized: boolean;
}

type ViewMode = "grid" | "feed";

export default function MonitorPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [panels, setPanels] = useState<MonitorPanel[]>([]);
  const [showSelector, setShowSelector] = useState(false);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [isLoadingExtensions, setIsLoadingExtensions] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const initialLoadDone = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Save selected extension IDs and view mode to user preferences (debounced)
  const saveMonitorPreferences = useCallback((extensionIds: string[], mode?: ViewMode) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const body: { monitorExtensionIds: string[]; monitorViewMode?: ViewMode } = {
          monitorExtensionIds: extensionIds,
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

  // Save view mode change
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    saveMonitorPreferences(panels.map((p) => p.extension.id), mode);
  }, [panels, saveMonitorPreferences]);

  const fetchExtensions = useCallback(async (): Promise<Extension[]> => {
    setIsLoadingExtensions(true);
    try {
      const response = await fetch("/api/extensions");
      if (response.ok) {
        const data = await response.json();
        setExtensions(data || []);
        return data || [];
      }
    } catch (error) {
      console.error("Failed to fetch extensions:", error);
    } finally {
      setIsLoadingExtensions(false);
    }
    return [];
  }, []);

  // Load saved monitor preferences on mount
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    (async () => {
      try {
        const [prefsResponse, extList] = await Promise.all([
          fetch("/api/user/preferences"),
          fetchExtensions(),
        ]);

        if (prefsResponse.ok) {
          const prefsData = await prefsResponse.json();
          const savedExtIds: string[] =
            prefsData.preferences?.monitorExtensionIds || [];
          // Also check for legacy conversation IDs (backward compat)
          const savedViewMode: ViewMode =
            prefsData.preferences?.monitorViewMode || "grid";

          setViewMode(savedViewMode);

          if (savedExtIds.length > 0 && extList.length > 0) {
            const savedPanels: MonitorPanel[] = [];
            for (const id of savedExtIds) {
              const ext = extList.find((e: Extension) => e.id === id);
              if (ext) {
                savedPanels.push({
                  id: `panel-${id}`,
                  extension: ext,
                  isMaximized: false,
                });
              }
            }
            setPanels(savedPanels);
          }
        }
      } catch (error) {
        console.error("Failed to load monitor preferences:", error);
      } finally {
        setIsLoadingInitial(false);
      }
    })();
  }, [fetchExtensions]);

  useEffect(() => {
    if (showSelector && extensions.length === 0) {
      fetchExtensions();
    }
  }, [showSelector, extensions.length, fetchExtensions]);

  const addPanel = (extension: Extension) => {
    if (panels.some((p) => p.extension.id === extension.id)) {
      return;
    }

    const newPanels = [
      ...panels,
      {
        id: `panel-${Date.now()}`,
        extension,
        isMaximized: false,
      },
    ];
    setPanels(newPanels);
    setShowSelector(false);
    saveMonitorPreferences(newPanels.map((p) => p.extension.id));
  };

  const removePanel = (panelId: string) => {
    const newPanels = panels.filter((p) => p.id !== panelId);
    setPanels(newPanels);
    saveMonitorPreferences(newPanels.map((p) => p.extension.id));
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

  const filteredExtensions = extensions.filter((ext) => {
    const title = getExtensionTitle(ext).toLowerCase();
    return title.includes(searchTerm.toLowerCase());
  });

  // Get available extensions (not already in panels)
  const availableExtensions = filteredExtensions.filter(
    (ext) => !panels.some((p) => p.extension.id === ext.id)
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
              {viewMode === "grid"
                ? "Monitor all chats for selected extensions"
                : "Live activity feed from all conversations"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* View Toggle */}
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
                  onClick={() => setShowSelector(true)}
                  className="flex items-center gap-2"
                  disabled={showSelector}
                >
                  <Plus className="h-4 w-4" />
                  Add Extension
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Extension Selector Modal */}
      {showSelector && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Select Extension to Monitor</h2>
              <button
                onClick={() => setShowSelector(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="p-4 border-b">
              <input
                type="text"
                placeholder="Search extensions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-900 placeholder-gray-400 bg-white"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {isLoadingExtensions ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="lg" />
                </div>
              ) : availableExtensions.length === 0 ? (
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
                      onClick={() => addPanel(ext)}
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
                            {ext.is_active ? "Active" : "Inactive"}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content based on view mode */}
      {viewMode === "feed" ? (
        // Feed View
        <div className="flex-1 bg-white rounded-lg shadow overflow-hidden">
          <ActivityFeed />
        </div>
      ) : (
        // Grid View
        <>
          {panels.length === 0 ? (
            <div className="flex-1 bg-white rounded-lg shadow flex items-center justify-center">
              <div className="text-center">
                <Phone className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No extensions selected
                </h3>
                <p className="text-gray-500 mb-4">
                  Click &quot;Add Extension&quot; to start monitoring an extension&apos;s chats
                </p>
                <Button onClick={() => setShowSelector(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Extension
                </Button>
              </div>
            </div>
          ) : maximizedPanel ? (
            // Show only maximized panel
            <div className="flex-1 bg-white rounded-lg shadow overflow-hidden flex flex-col">
              <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
                <h3 className="font-medium text-gray-900 truncate flex items-center gap-2">
                  <Phone className="h-4 w-4 text-teal-600" />
                  {getExtensionTitle(maximizedPanel.extension)}
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
                <ExtensionMessageList extensionId={maximizedPanel.extension.id} />
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
                    <h3 className="font-medium text-gray-900 truncate text-sm flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-teal-600" />
                      {getExtensionTitle(panel.extension)}
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
                    <ExtensionMessageList extensionId={panel.extension.id} />
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
