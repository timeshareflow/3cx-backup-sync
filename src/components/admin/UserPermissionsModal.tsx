"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Input } from "@/components/ui/Input";
import { CheckSquare, Square, Users, MessageSquare, Search, Phone, Mic, Video, Voicemail, FileText, ToggleLeft, ToggleRight } from "lucide-react";

interface Conversation {
  id: string;
  conversation_name: string | null;
  is_group_chat: boolean;
  message_count: number;
  participant_count: number;
  participants: Array<{
    external_id: string | null;
    external_name: string | null;
    extension_id: string | null;
    participant_type: string;
  }>;
}

interface FeaturePermissions {
  canViewCdr: boolean;
  canViewRecordings: boolean;
  canViewMeetings: boolean;
  canViewVoicemails: boolean;
  canViewFaxes: boolean;
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

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [featurePermissions, setFeaturePermissions] = useState<FeaturePermissions>({
    canViewCdr: true,
    canViewRecordings: true,
    canViewMeetings: true,
    canViewVoicemails: true,
    canViewFaxes: true,
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
      // Fetch all conversations and current permissions in parallel
      const [conversationsRes, permissionsRes] = await Promise.all([
        fetch("/api/conversations?limit=1000"),
        fetch(`/api/admin/users/${userId}/permissions`),
      ]);

      if (!conversationsRes.ok || !permissionsRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const conversationsData = await conversationsRes.json();
      const permissionsData = await permissionsRes.json();

      // Get all conversations with messages
      const allConversations: Conversation[] = (conversationsData.data || [])
        .filter((c: Conversation) => c.message_count > 0);

      setConversations(allConversations);

      // Build the selected set from both conversation permissions and extension permissions
      const selectedSet = new Set<string>();

      // Add directly permitted conversations (group chats and any conversation-level permissions)
      for (const convId of (permissionsData.groupChatIds || [])) {
        selectedSet.add(convId);
      }

      // Map extension permissions to conversations
      // If user has permission for an extension, select all conversations where that extension participates
      const permittedExtIds = new Set<string>(permissionsData.extensionIds || []);
      if (permittedExtIds.size > 0) {
        for (const conv of allConversations) {
          if (!conv.is_group_chat && conv.participants?.some(
            p => p.extension_id && permittedExtIds.has(p.extension_id)
          )) {
            selectedSet.add(conv.id);
          }
        }
      }

      setSelectedConversations(selectedSet);

      // Set feature permissions from API response
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
      // Split selected into group chats and 1-on-1 chats
      const selectedGroupChatIds: string[] = [];
      const selectedExtensionIds = new Set<string>();

      for (const convId of selectedConversations) {
        const conv = conversations.find(c => c.id === convId);
        if (!conv) continue;

        if (conv.is_group_chat) {
          selectedGroupChatIds.push(convId);
        } else {
          // For 1-on-1 chats, add participant extension IDs
          selectedGroupChatIds.push(convId); // Also store as conversation permission
          for (const p of (conv.participants || [])) {
            if (p.extension_id) {
              selectedExtensionIds.add(p.extension_id);
            }
          }
        }
      }

      const response = await fetch(`/api/admin/users/${userId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extensionIds: Array.from(selectedExtensionIds),
          groupChatIds: selectedGroupChatIds,
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

  const toggleConversation = (id: string) => {
    setSelectedConversations(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const oneOnOneChats = conversations.filter(c => !c.is_group_chat);
  const groupChats = conversations.filter(c => c.is_group_chat);

  const filteredOneOnOne = oneOnOneChats.filter(c =>
    !searchQuery ||
    c.conversation_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGroupChats = groupChats.filter(c =>
    !searchQuery ||
    c.conversation_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectAllOneOnOne = () => {
    setSelectedConversations(prev => {
      const next = new Set(prev);
      oneOnOneChats.forEach(c => next.add(c.id));
      return next;
    });
  };

  const deselectAllOneOnOne = () => {
    setSelectedConversations(prev => {
      const next = new Set(prev);
      oneOnOneChats.forEach(c => next.delete(c.id));
      return next;
    });
  };

  const selectAllGroupChats = () => {
    setSelectedConversations(prev => {
      const next = new Set(prev);
      groupChats.forEach(c => next.add(c.id));
      return next;
    });
  };

  const deselectAllGroupChats = () => {
    setSelectedConversations(prev => {
      const next = new Set(prev);
      groupChats.forEach(c => next.delete(c.id));
      return next;
    });
  };

  const selectedOneOnOneCount = oneOnOneChats.filter(c => selectedConversations.has(c.id)).length;
  const selectedGroupChatCount = groupChats.filter(c => selectedConversations.has(c.id)).length;

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
              {/* CDR */}
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

              {/* Recordings */}
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

              {/* Meetings */}
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

              {/* Voicemails */}
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

              {/* Faxes */}
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

          {/* Conversation Permissions Header */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Chat Access</h3>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
          </div>

          {/* 1-on-1 Chats Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                1-on-1 Chats ({selectedOneOnOneCount}/{oneOnOneChats.length} selected)
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllOneOnOne}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Select All
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={deselectAllOneOnOne}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {filteredOneOnOne.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                {searchQuery ? "No matching chats" : "No 1-on-1 chats with messages"}
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                {filteredOneOnOne.map(conv => (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => toggleConversation(conv.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 text-left"
                  >
                    {selectedConversations.has(conv.id) ? (
                      <CheckSquare className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    )}
                    <span className="text-sm text-gray-900 truncate flex-1">
                      {conv.conversation_name || "Unnamed Chat"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {conv.message_count} msgs
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
                Group Chats ({selectedGroupChatCount}/{groupChats.length} selected)
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
                    onClick={() => toggleConversation(conv.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 text-left"
                  >
                    {selectedConversations.has(conv.id) ? (
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

          {/* Info message */}
          <p className="text-xs text-gray-500">
            Users with no conversations selected will not see any chats.
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
