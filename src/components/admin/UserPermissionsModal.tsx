"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Input } from "@/components/ui/Input";
import { CheckSquare, Square, Users, Search, Phone, Mic, Video, Voicemail, FileText, ToggleLeft, ToggleRight } from "lucide-react";

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
  message_count: number;
  participant_count: number;
}

interface FeaturePermissions {
  canViewCdr: boolean;
  canViewRecordings: boolean;
  canViewMeetings: boolean;
  canViewVoicemails: boolean;
  canViewFaxes: boolean;
}

interface ExtensionPermission {
  extensionId: string;
  canAccessRecordings: boolean;
}

interface UserPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  onSave?: () => void;
}

export function UserPermissionsModal({
  isOpen,
  onClose,
  userId,
  userName,
  onSave,
}: UserPermissionsModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [groupChats, setGroupChats] = useState<Conversation[]>([]);
  const [selectedExtensions, setSelectedExtensions] = useState<Set<string>>(new Set());
  const [extensionRecordingAccess, setExtensionRecordingAccess] = useState<Map<string, boolean>>(new Map());
  const [selectedGroupChats, setSelectedGroupChats] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [featurePermissions, setFeaturePermissions] = useState<FeaturePermissions>({
    canViewCdr: false,
    canViewRecordings: false,
    canViewMeetings: false,
    canViewVoicemails: false,
    canViewFaxes: false,
  });

  // Fetch data when modal opens
  useEffect(() => {
    if (isOpen && userId) {
      fetchData();
    }
  }, [isOpen, userId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [extensionsRes, conversationsRes, permissionsRes] = await Promise.all([
        fetch("/api/extensions"),
        fetch("/api/conversations?limit=1000"),
        fetch(`/api/admin/users/${userId}/permissions`),
      ]);

      if (!extensionsRes.ok || !conversationsRes.ok || !permissionsRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const extensionsData = await extensionsRes.json();
      const conversationsData = await conversationsRes.json();
      const permissionsData = await permissionsRes.json();

      setExtensions(extensionsData || []);

      // Filter to only group chats with messages
      const groups = (conversationsData.data || [])
        .filter((c: Conversation) => c.is_group_chat && c.message_count > 0);
      setGroupChats(groups);

      // Build selected extensions from permissions
      const selectedExtSet = new Set<string>(permissionsData.extensionIds || []);
      setSelectedExtensions(selectedExtSet);

      // Build recording access map
      const recordingAccessMap = new Map<string, boolean>();
      for (const perm of (permissionsData.extensionPermissions || [])) {
        recordingAccessMap.set(perm.extensionId, perm.canAccessRecordings);
      }
      setExtensionRecordingAccess(recordingAccessMap);

      // Build selected group chats
      const selectedGroupSet = new Set<string>(permissionsData.groupChatIds || []);
      setSelectedGroupChats(selectedGroupSet);

      // Set feature permissions
      if (permissionsData.featurePermissions) {
        setFeaturePermissions(permissionsData.featurePermissions);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Failed to load permissions data");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const extensionPermissions: ExtensionPermission[] = [];
      for (const extId of selectedExtensions) {
        extensionPermissions.push({
          extensionId: extId,
          canAccessRecordings: extensionRecordingAccess.get(extId) ?? false,
        });
      }

      const response = await fetch(`/api/admin/users/${userId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extensionPermissions,
          groupChatIds: Array.from(selectedGroupChats),
          featurePermissions,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save permissions");
      }

      onSave?.();
      onClose();
    } catch (err) {
      console.error("Error saving permissions:", err);
      setError(err instanceof Error ? err.message : "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  const toggleExtension = (id: string) => {
    setSelectedExtensions(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleExtensionRecording = (extId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExtensionRecordingAccess(prev => {
      const next = new Map(prev);
      next.set(extId, !(next.get(extId) ?? false));
      return next;
    });
  };

  const toggleGroupChat = (id: string) => {
    setSelectedGroupChats(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getExtensionTitle = (ext: Extension) => {
    const name = ext.display_name ||
      [ext.first_name, ext.last_name].filter(Boolean).join(" ") ||
      ext.extension_number;
    return `${name} (${ext.extension_number})`;
  };

  const filteredExtensions = extensions.filter(ext => {
    if (!searchQuery) return true;
    return getExtensionTitle(ext).toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filteredGroupChats = groupChats.filter(c => {
    if (!searchQuery) return true;
    return c.conversation_name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const selectAllExtensions = () => {
    setSelectedExtensions(new Set(extensions.map(e => e.id)));
  };

  const deselectAllExtensions = () => {
    setSelectedExtensions(new Set());
  };

  const selectAllGroupChats = () => {
    setSelectedGroupChats(new Set(groupChats.map(c => c.id)));
  };

  const deselectAllGroupChats = () => {
    setSelectedGroupChats(new Set());
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Permissions for ${userName}`} size="lg">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
          <span className="ml-2 text-gray-600">Loading permissions...</span>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={fetchData}>Retry</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Feature Permissions Section */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Feature Access</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFeaturePermissions(prev => ({ ...prev, canViewCdr: !prev.canViewCdr }))}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-white transition-colors text-left"
              >
                {featurePermissions.canViewCdr ? (
                  <ToggleRight className="h-5 w-5 text-green-600" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-gray-400" />
                )}
                <Phone className="h-4 w-4 text-gray-600" />
                <span className="text-sm text-gray-700">Call History (CDR)</span>
              </button>

              <button
                type="button"
                onClick={() => setFeaturePermissions(prev => ({ ...prev, canViewRecordings: !prev.canViewRecordings }))}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-white transition-colors text-left"
              >
                {featurePermissions.canViewRecordings ? (
                  <ToggleRight className="h-5 w-5 text-green-600" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-gray-400" />
                )}
                <Mic className="h-4 w-4 text-gray-600" />
                <span className="text-sm text-gray-700">Call Recordings</span>
              </button>

              <button
                type="button"
                onClick={() => setFeaturePermissions(prev => ({ ...prev, canViewMeetings: !prev.canViewMeetings }))}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-white transition-colors text-left"
              >
                {featurePermissions.canViewMeetings ? (
                  <ToggleRight className="h-5 w-5 text-green-600" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-gray-400" />
                )}
                <Video className="h-4 w-4 text-gray-600" />
                <span className="text-sm text-gray-700">Meetings</span>
              </button>

              <button
                type="button"
                onClick={() => setFeaturePermissions(prev => ({ ...prev, canViewVoicemails: !prev.canViewVoicemails }))}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-white transition-colors text-left"
              >
                {featurePermissions.canViewVoicemails ? (
                  <ToggleRight className="h-5 w-5 text-green-600" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-gray-400" />
                )}
                <Voicemail className="h-4 w-4 text-gray-600" />
                <span className="text-sm text-gray-700">Voicemails</span>
              </button>

              <button
                type="button"
                onClick={() => setFeaturePermissions(prev => ({ ...prev, canViewFaxes: !prev.canViewFaxes }))}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-white transition-colors text-left"
              >
                {featurePermissions.canViewFaxes ? (
                  <ToggleRight className="h-5 w-5 text-green-600" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-gray-400" />
                )}
                <FileText className="h-4 w-4 text-gray-600" />
                <span className="text-sm text-gray-700">Faxes</span>
              </button>
            </div>
          </div>

          {/* Chat Access Header */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Chat Access</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search extensions or group chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
          </div>

          {/* Extensions Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Extensions ({selectedExtensions.size}/{extensions.length} selected)
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllExtensions}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Select All
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={deselectAllExtensions}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-2">
              Selecting an extension grants access to all its direct message conversations.
            </p>

            {filteredExtensions.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                {searchQuery ? "No matching extensions" : "No extensions found"}
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                {filteredExtensions.map(ext => {
                  const isSelected = selectedExtensions.has(ext.id);
                  const hasRecordingAccess = extensionRecordingAccess.get(ext.id) ?? false;
                  return (
                    <div
                      key={ext.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => toggleExtension(ext.id)}
                        className="flex items-center gap-3 flex-1 text-left"
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-blue-600 flex-shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        )}
                        <span className="text-sm text-gray-900 truncate flex-1">
                          {getExtensionTitle(ext)}
                        </span>
                        {!ext.is_active && (
                          <span className="text-xs text-gray-400">Inactive</span>
                        )}
                      </button>
                      {isSelected && (
                        <button
                          type="button"
                          onClick={(e) => toggleExtensionRecording(ext.id, e)}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                            hasRecordingAccess
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                          title={hasRecordingAccess ? "Recording access enabled" : "Recording access disabled"}
                        >
                          <Mic className="h-3 w-3" />
                          {hasRecordingAccess ? "On" : "Off"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Group Chats Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Group Chats ({selectedGroupChats.size}/{groupChats.length} selected)
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllGroupChats}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Select All
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={deselectAllGroupChats}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {filteredGroupChats.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                {searchQuery ? "No matching group chats" : "No group chats with messages"}
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                {filteredGroupChats.map(conv => (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => toggleGroupChat(conv.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 text-left"
                  >
                    {selectedGroupChats.has(conv.id) ? (
                      <CheckSquare className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    )}
                    <span className="text-sm text-gray-900 truncate flex-1">
                      {conv.conversation_name || "Unnamed Group"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {conv.message_count} msgs
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="text-xs text-gray-500 space-y-1">
            <p>Users with no permissions will not see any chats. Admins bypass these restrictions.</p>
            <p>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                <Mic className="h-3 w-3" />On
              </span>
              {" "}enables recording access for that extension.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Spinner size="sm" />
                  <span className="ml-2">Saving...</span>
                </>
              ) : (
                "Save Permissions"
              )}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
