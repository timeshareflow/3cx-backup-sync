"use client";

import { formatMessageTime } from "@/lib/utils/date";
import { MediaPreview } from "./MediaPreview";
import type { MessageWithMedia } from "@/types";

interface MessageBubbleProps {
  message: MessageWithMedia;
  isHighlighted?: boolean;
}

// Check if content is just a filename (should be hidden when media is present)
function isJustFilename(content: string | null, mediaFiles: { file_name: string }[]): boolean {
  if (!content) return false;
  const trimmed = content.trim();

  // Check if content matches any of the media file names
  if (mediaFiles.some(m => m.file_name === trimmed)) return true;

  // Check if content looks like a filename (common extensions)
  const fileExtensions = /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|webm|wav|mp3|pdf|doc|docx)$/i;
  return fileExtensions.test(trimmed);
}

export function MessageBubble({ message, isHighlighted = false }: MessageBubbleProps) {
  const hasMedia = message.media_files && message.media_files.length > 0;
  const hasText = message.content && message.content.trim().length > 0;

  // Hide text if it's just a filename and we have media to show
  const shouldShowText = hasText && !(hasMedia && isJustFilename(message.content, message.media_files));

  return (
    <div
      className={`message-enter ${isHighlighted ? "bg-yellow-50 -mx-2 px-2 py-1 rounded-lg" : ""}`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-medium">
            {message.sender_name
              ? message.sender_name.charAt(0).toUpperCase()
              : message.sender_identifier?.charAt(0) || "?"}
          </div>
        </div>

        {/* Message content */}
        <div className="flex-1 min-w-0">
          {/* Sender info */}
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-medium text-gray-900">
              {message.sender_name || message.sender_identifier || "Unknown"}
            </span>
            {message.sender_identifier && message.sender_name && (
              <span className="text-xs text-gray-500">
                ext. {message.sender_identifier}
              </span>
            )}
            <span className="text-xs text-gray-400">
              {formatMessageTime(message.sent_at)}
            </span>
          </div>

          {/* Text content */}
          {shouldShowText && (
            <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-2 inline-block max-w-[80%]">
              <p className="text-gray-800 whitespace-pre-wrap break-words">
                {message.content}
              </p>
            </div>
          )}

          {/* Media content */}
          {hasMedia && (
            <div className={`${shouldShowText ? "mt-2" : ""}`}>
              <div className="flex flex-wrap gap-2">
                {message.media_files.map((media) => (
                  <MediaPreview key={media.id} media={media} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Compact version for search results
export function MessageBubbleCompact({
  message,
  searchQuery,
}: MessageBubbleProps & { searchQuery?: string }) {
  const highlightText = (text: string, query: string) => {
    if (!query) return text;

    const parts = text.split(new RegExp(`(${query})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="py-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-gray-900">
          {message.sender_name || message.sender_identifier}
        </span>
        <span className="text-gray-400">
          {formatMessageTime(message.sent_at)}
        </span>
      </div>
      <p className="text-gray-700 mt-1 line-clamp-2">
        {searchQuery && message.content
          ? highlightText(message.content, searchQuery)
          : message.content}
      </p>
    </div>
  );
}
