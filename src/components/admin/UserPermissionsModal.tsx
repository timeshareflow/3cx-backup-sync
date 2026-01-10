"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { CheckSquare, Square, Users, Phone } from "lucide-react";

interface Extension {
  id: string;
  extension_number: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface GroupChat {
  id: string;
  conversation_name: string | null;
  participant_count: number;
  participants: Array<{
    participant_name: string | null;
    participant_identifier: string;
  }>;
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
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [selectedExtensions, setSelectedExtensions] = useState<Set<string>>(new Set());
  const [selectedGroupChats, setSelectedGroupChats] = useState<Set<string>>(new Set());

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
      // Fetch extensions, group chats, and current permissions in parallel
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

      // Set extensions
      setExtensions(extensionsData.data || extensionsData || []);

      // Filter for group chats only
      const allConversations = conversationsData.data || [];
      const groups = allConversations.filter((c: { is_group_chat: boolean }) => c.is_group_chat);
      setGroupChats(groups);

      // Set current permissions
      setSelectedExtensions(new Set(permissionsData.extensionIds || []));
      setSelectedGroupChats(new Set(permissionsData.groupChatIds || []));
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
      const response = await fetch(`/api/admin/users/${userId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extensionIds: Array.from(selectedExtensions),
          groupChatIds: Array.from(selectedGroupChats),
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
    setSelectedExtensions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleGroupChat = (id: string) => {
    setSelectedGroupChats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllExtensions = () => {
    setSelectedExtensions(new Set(extensions.map((e) => e.id)));
  };

  const deselectAllExtensions = () => {
    setSelectedExtensions(new Set());
  };

  const selectAllGroupChats = () => {
    setSelectedGroupChats(new Set(groupChats.map((g) => g.id)));
  };

  const deselectAllGroupChats = () => {
    setSelectedGroupChats(new Set());
  };

  const getExtensionDisplayName = (ext: Extension) => {
    if (ext.display_name) return ext.display_name;
    if (ext.first_name || ext.last_name) {
      return `${ext.first_name || ""} ${ext.last_name || ""}`.trim();
    }
    return `Extension ${ext.extension_number}`;
  };

  const getGroupChatDisplayName = (chat: GroupChat) => {
    if (chat.conversation_name) return chat.conversation_name;
    const participantNames = chat.participants
      ?.slice(0, 3)
      .map((p) => p.participant_name || p.participant_identifier)
      .join(", ");
    return participantNames || `Group (${chat.participant_count} participants)`;
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

            {extensions.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No extensions available</p>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                {extensions.map((ext) => (
                  <button
                    key={ext.id}
                    type="button"
                    onClick={() => toggleExtension(ext.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 text-left"
                  >
                    {selectedExtensions.has(ext.id) ? (
                      <CheckSquare className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    )}
                    <span className="font-mono text-sm text-gray-600 w-16">
                      {ext.extension_number}
                    </span>
                    <span className="text-sm text-gray-900 truncate">
                      {getExtensionDisplayName(ext)}
                    </span>
                  </button>
                ))}
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

            {groupChats.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No group chats available</p>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                {groupChats.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => toggleGroupChat(chat.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 text-left"
                  >
                    {selectedGroupChats.has(chat.id) ? (
                      <CheckSquare className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    )}
                    <span className="text-sm text-gray-900 truncate flex-1">
                      {getGroupChatDisplayName(chat)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {chat.participant_count} members
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info message */}
          <p className="text-xs text-gray-500">
            Users with no permissions selected will not see any conversations.
            Admins bypass these restrictions.
          </p>

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
