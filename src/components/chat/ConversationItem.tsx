"use client";

import Link from "next/link";
import { MessageSquare, Users } from "lucide-react";
import { formatConversationTime } from "@/lib/utils/date";
import type { ConversationWithParticipants } from "@/types";

interface ConversationItemProps {
  conversation: ConversationWithParticipants;
}

export function ConversationItem({ conversation }: ConversationItemProps) {
  const participantNames = conversation.participants
    .map((p) => p.external_name || p.external_id || "Unknown")
    .join(", ");

  return (
    <Link
      href={`/conversations/${conversation.id}`}
      className="block p-4 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {conversation.is_group_chat ? (
            <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
          ) : (
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
              <MessageSquare className="h-6 w-6 text-blue-600" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900 truncate">
              {conversation.conversation_name || participantNames || "Conversation"}
            </h3>
            {conversation.last_message_at && (
              <span className="text-sm text-gray-500 flex-shrink-0 ml-2">
                {formatConversationTime(conversation.last_message_at)}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-600 truncate mt-1">
            {conversation.participants.length > 2
              ? `${conversation.participant_count} participants`
              : participantNames}
          </p>

          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {conversation.message_count.toLocaleString()} messages
            </span>

            {conversation.is_group_chat && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {conversation.participant_count}
              </span>
            )}

            {conversation.is_external && (
              <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs">
                External
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

// Compact square card for grid layout
export function ConversationCard({ conversation }: ConversationItemProps) {
  const primaryParticipant = conversation.participants[0];
  const displayName = conversation.conversation_name ||
    primaryParticipant?.external_name ||
    primaryParticipant?.external_id ||
    "Unknown";

  const initial = displayName.charAt(0).toUpperCase();

  // Different styling for group chats vs regular conversations
  const borderClass = conversation.is_group_chat
    ? "border-purple-200 hover:border-purple-400"
    : conversation.is_external
    ? "border-amber-200 hover:border-amber-400"
    : "border-slate-200 hover:border-teal-300";

  const bgClass = conversation.is_group_chat
    ? "from-purple-50 to-violet-50"
    : conversation.is_external
    ? "from-amber-50 to-orange-50"
    : "from-slate-50 to-white";

  return (
    <Link
      href={`/conversations/${conversation.id}`}
      className={`block p-3 bg-gradient-to-br ${bgClass} rounded-xl border ${borderClass} hover:shadow-md transition-all group`}
    >
      <div className="flex flex-col items-center text-center">
        {/* Avatar */}
        <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white text-lg font-bold mb-2 ${
          conversation.is_group_chat
            ? "bg-gradient-to-br from-purple-500 to-violet-600"
            : conversation.is_external
            ? "bg-gradient-to-br from-amber-500 to-orange-600"
            : "bg-gradient-to-br from-teal-500 to-cyan-600"
        }`}>
          {conversation.is_group_chat ? (
            <Users className="h-6 w-6" />
          ) : (
            initial
          )}
        </div>

        {/* Name */}
        <p className="font-medium text-slate-800 text-sm truncate w-full group-hover:text-teal-700">
          {displayName}
        </p>

        {/* Extension ID if different from name - hide for group chats */}
        {!conversation.is_group_chat && primaryParticipant?.external_id && primaryParticipant.external_name && (
          <p className="text-xs text-slate-500 truncate w-full">
            Ext. {primaryParticipant.external_id}
          </p>
        )}

        {/* Message count */}
        <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-500">
          <MessageSquare className="h-3 w-3" />
          <span>{conversation.message_count}</span>
        </div>

        {/* Tags */}
        <div className="flex gap-1 mt-1.5 flex-wrap justify-center">
          {conversation.is_group_chat && (
            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-medium">
              Group
            </span>
          )}
          {conversation.is_external && (
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">
              External
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// Smaller version for search results
export function ConversationItemCompact({
  conversation,
}: ConversationItemProps) {
  const participantNames = conversation.participants
    .map((p) => p.external_name || p.external_id)
    .join(", ");

  return (
    <Link
      href={`/conversations/${conversation.id}`}
      className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100"
    >
      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
        <MessageSquare className="h-4 w-4 text-blue-600" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {conversation.conversation_name || participantNames}
        </p>
        <p className="text-xs text-gray-500">
          {conversation.message_count} messages
        </p>
      </div>
    </Link>
  );
}
