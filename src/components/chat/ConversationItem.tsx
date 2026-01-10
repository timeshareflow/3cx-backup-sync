"use client";

import Link from "next/link";
import { MessageSquare, Users, Image, Video, FileText } from "lucide-react";
import { formatConversationTime } from "@/lib/utils/date";
import type { ConversationWithParticipants } from "@/types";

interface ConversationItemProps {
  conversation: ConversationWithParticipants;
}

export function ConversationItem({ conversation }: ConversationItemProps) {
  const participantNames = conversation.participants
    .map((p) => p.display_name || p.extension_number || "Unknown")
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

// Smaller version for search results
export function ConversationItemCompact({
  conversation,
}: ConversationItemProps) {
  const participantNames = conversation.participants
    .map((p) => p.display_name || p.extension_number)
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
