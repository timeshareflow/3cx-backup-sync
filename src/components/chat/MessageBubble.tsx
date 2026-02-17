"use client";

import { formatMessageTime } from "@/lib/utils/date";
import { MediaPreview } from "./MediaPreview";
import { Image as ImageIcon, Film, FileText, Music } from "lucide-react";
import type { MessageWithMedia } from "@/types";

interface MessageBubbleProps {
  message: MessageWithMedia;
  isHighlighted?: boolean;
  highlightQuery?: string;
}

const FILE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|heic|mp4|mov|avi|webm|3gp|wav|mp3|ogg|aac|pdf|doc|docx)$/i;

// Check if content is just a filename (should be hidden when media is present)
function isJustFilename(content: string | null, mediaFiles: { file_name: string }[]): boolean {
  if (!content) return false;
  const trimmed = content.trim();

  // Check if content matches any of the media file names
  if (mediaFiles.some(m => m.file_name === trimmed)) return true;

  // Check if content looks like a filename (common extensions)
  return FILE_EXTENSIONS.test(trimmed);
}

function getFileTypeFromName(filename: string): "image" | "video" | "audio" | "document" {
  if (/\.(jpg|jpeg|png|gif|webp|heic)$/i.test(filename)) return "image";
  if (/\.(mp4|mov|avi|webm|3gp)$/i.test(filename)) return "video";
  if (/\.(wav|mp3|ogg|aac)$/i.test(filename)) return "audio";
  return "document";
}

function FileAttachmentCard({ filename }: { filename: string }) {
  const fileType = getFileTypeFromName(filename);
  const Icon = fileType === "image" ? ImageIcon
    : fileType === "video" ? Film
    : fileType === "audio" ? Music
    : FileText;
  const label = fileType === "image" ? "Image"
    : fileType === "video" ? "Video"
    : fileType === "audio" ? "Audio"
    : "File";
  const bgColor = fileType === "image" ? "bg-blue-50 border-blue-200"
    : fileType === "video" ? "bg-purple-50 border-purple-200"
    : fileType === "audio" ? "bg-amber-50 border-amber-200"
    : "bg-gray-50 border-gray-200";
  const iconColor = fileType === "image" ? "text-blue-500"
    : fileType === "video" ? "text-purple-500"
    : fileType === "audio" ? "text-amber-500"
    : "text-gray-500";

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border-2 ${bgColor} max-w-xs`}>
      <div className={`h-10 w-10 rounded-lg ${fileType === "image" ? "bg-blue-100" : fileType === "video" ? "bg-purple-100" : fileType === "audio" ? "bg-amber-100" : "bg-gray-200"} flex items-center justify-center`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{filename}</p>
        <p className="text-xs text-gray-500">{label} attachment</p>
      </div>
    </div>
  );
}

function highlightText(text: string, query: string | undefined): React.ReactNode {
  if (!query || !text) return text;
  try {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${escaped})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  } catch {
    return text;
  }
}

export function MessageBubble({ message, isHighlighted = false, highlightQuery }: MessageBubbleProps) {
  const hasMedia = message.media_files && message.media_files.length > 0;
  const hasText = message.content && message.content.trim().length > 0;
  const contentIsFilename = hasText && FILE_EXTENSIONS.test(message.content!.trim());

  // Hide text if it's just a filename (whether we have linked media or not)
  const shouldShowText = hasText && !contentIsFilename;
  // Show attachment card when content is a filename but no linked media
  const shouldShowAttachmentCard = contentIsFilename && !hasMedia;

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
                {highlightQuery ? highlightText(message.content!, highlightQuery) : message.content}
              </p>
            </div>
          )}

          {/* Styled attachment card for filename messages without linked media */}
          {shouldShowAttachmentCard && (
            <FileAttachmentCard filename={message.content!.trim()} />
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
