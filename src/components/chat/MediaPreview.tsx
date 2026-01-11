"use client";

import { useState, useEffect } from "react";
import { Play, FileText, Download, X, ZoomIn, ZoomOut, Loader2, Image as ImageIcon } from "lucide-react";
import type { MediaFile } from "@/types";

interface MediaPreviewProps {
  media: MediaFile;
}

// Helper to determine file type from mime_type
function getFileType(mimeType: string | null): "image" | "video" | "audio" | "document" {
  if (!mimeType) return "document";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

export function MediaPreview({ media }: MediaPreviewProps) {
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const fileType = getFileType(media.mime_type);

  // Auto-fetch media URL on mount
  useEffect(() => {
    const fetchMediaUrl = async () => {
      setIsLoading(true);
      setError(false);
      try {
        const response = await fetch(`/api/media/${media.id}`);
        if (response.ok) {
          const data = await response.json();
          setMediaUrl(data.url);
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error("Failed to fetch media URL:", {
            mediaId: media.id,
            fileName: media.file_name,
            status: response.status,
            error: errorData.error || response.statusText,
          });
          setError(true);
        }
      } catch (err) {
        console.error("Failed to fetch media URL:", media.id, err);
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMediaUrl();
  }, [media.id, media.file_name]);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mediaUrl) {
      const link = document.createElement("a");
      link.href = mediaUrl;
      link.download = media.file_name || "download";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Image preview
  if (fileType === "image") {
    return (
      <>
        <div className="relative group inline-block">
          <button
            onClick={() => setIsViewerOpen(true)}
            className="relative cursor-pointer overflow-hidden rounded-xl border-2 border-gray-200 hover:border-teal-400 transition-colors bg-gray-100"
            style={{
              width: Math.min(media.width || 280, 280),
              height: Math.min(media.height || 200, 200),
            }}
          >
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center bg-gray-100">
                <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
              </div>
            ) : error ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-400">
                <ImageIcon className="h-10 w-10 mb-2" />
                <span className="text-xs">Failed to load</span>
              </div>
            ) : mediaUrl ? (
              <img
                src={mediaUrl}
                alt={media.file_name || "Image"}
                className="w-full h-full object-cover"
              />
            ) : null}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
            </div>
          </button>

          {/* Download button */}
          {mediaUrl && (
            <button
              onClick={handleDownload}
              className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
        </div>

        <MediaViewer
          isOpen={isViewerOpen}
          onClose={() => setIsViewerOpen(false)}
          url={mediaUrl}
          filename={media.file_name}
          fileType="image"
          onDownload={handleDownload}
        />
      </>
    );
  }

  // Video preview
  if (fileType === "video") {
    return (
      <>
        <div className="relative group inline-block">
          <button
            onClick={() => setIsViewerOpen(true)}
            className="relative cursor-pointer overflow-hidden rounded-xl border-2 border-gray-200 hover:border-teal-400 transition-colors bg-gray-900"
            style={{ width: 280, height: 180 }}
          >
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              </div>
            ) : mediaUrl ? (
              <>
                {/* Video thumbnail - first frame */}
                <video
                  src={mediaUrl}
                  className="w-full h-full object-cover"
                  preload="metadata"
                  muted
                />
                {/* Play button overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                  <div className="h-14 w-14 rounded-full bg-white/90 group-hover:bg-white flex items-center justify-center shadow-lg transition-colors">
                    <Play className="h-7 w-7 text-gray-900 ml-1" />
                  </div>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60">
                <Play className="h-10 w-10 mb-2" />
                <span className="text-xs">Video unavailable</span>
              </div>
            )}

            {/* Duration badge */}
            {media.duration_seconds && (
              <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-md font-medium">
                {formatDuration(media.duration_seconds)}
              </div>
            )}

            {/* Filename */}
            <div className="absolute bottom-2 right-2 left-16 text-right">
              <span className="text-white/80 text-xs truncate block bg-black/50 px-2 py-1 rounded-md">
                {media.file_name || "Video"}
              </span>
            </div>
          </button>

          {/* Download button */}
          {mediaUrl && (
            <button
              onClick={handleDownload}
              className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
        </div>

        <MediaViewer
          isOpen={isViewerOpen}
          onClose={() => setIsViewerOpen(false)}
          url={mediaUrl}
          filename={media.file_name}
          fileType="video"
          onDownload={handleDownload}
        />
      </>
    );
  }

  // Audio preview
  if (fileType === "audio") {
    return (
      <div className="relative group">
        <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 bg-gray-50 max-w-xs">
          {isLoading ? (
            <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          ) : mediaUrl ? (
            <audio src={mediaUrl} controls className="w-full h-10" preload="metadata" />
          ) : (
            <span className="text-gray-400 text-sm">Audio unavailable</span>
          )}
        </div>

        {/* Download button */}
        {mediaUrl && (
          <button
            onClick={handleDownload}
            className="absolute top-2 right-2 p-1.5 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  // Document / other file types
  return (
    <div className="relative group inline-block">
      <button
        onClick={handleDownload}
        disabled={!mediaUrl}
        className="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-teal-400 transition-colors disabled:opacity-50"
      >
        <div className="h-10 w-10 rounded-lg bg-gray-200 flex items-center justify-center">
          <FileText className="h-6 w-6 text-gray-500" />
        </div>
        <div className="text-left">
          <p className="text-sm font-medium text-gray-900 truncate max-w-[180px]">
            {media.file_name || "Document"}
          </p>
          {media.file_size && (
            <p className="text-xs text-gray-500">
              {formatFileSize(media.file_size)}
            </p>
          )}
        </div>
        <Download className="h-5 w-5 text-gray-400" />
      </button>
    </div>
  );
}

// Unified Media Viewer Modal
function MediaViewer({
  isOpen,
  onClose,
  url,
  filename,
  fileType,
  onDownload,
}: {
  isOpen: boolean;
  onClose: () => void;
  url: string | null;
  filename: string | null;
  fileType: "image" | "video";
  onDownload: (e: React.MouseEvent) => void;
}) {
  const [zoom, setZoom] = useState(1);

  // Reset zoom when opening
  useEffect(() => {
    if (isOpen) setZoom(1);
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent z-10">
        <div className="flex items-center gap-3">
          <span className="text-white font-medium truncate max-w-md">{filename}</span>
        </div>
        <div className="flex items-center gap-1">
          {fileType === "image" && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setZoom((z) => Math.max(0.25, z - 0.25));
                }}
                className="p-2.5 text-white hover:bg-white/20 rounded-xl transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <span className="text-white text-sm w-14 text-center">{Math.round(zoom * 100)}%</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setZoom((z) => Math.min(4, z + 0.25));
                }}
                className="p-2.5 text-white hover:bg-white/20 rounded-xl transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
              <div className="w-px h-6 bg-white/30 mx-2" />
            </>
          )}
          <button
            onClick={onDownload}
            className="p-2.5 text-white hover:bg-white/20 rounded-xl transition-colors"
            title="Download"
          >
            <Download className="h-5 w-5" />
          </button>
          <button
            onClick={onClose}
            className="p-2.5 text-white hover:bg-white/20 rounded-xl transition-colors ml-2"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="flex items-center justify-center h-full p-16"
        onClick={(e) => e.stopPropagation()}
      >
        {!url ? (
          <div className="flex flex-col items-center text-white/60">
            <Loader2 className="h-12 w-12 animate-spin mb-4" />
            <span>Loading...</span>
          </div>
        ) : fileType === "image" ? (
          <div
            className="relative overflow-auto max-h-full max-w-full"
            style={{ cursor: zoom > 1 ? "move" : "default" }}
          >
            <img
              src={url}
              alt={filename || "Image"}
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition-transform duration-200"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
              draggable={false}
            />
          </div>
        ) : (
          <video
            src={url}
            controls
            autoPlay
            className="max-h-[85vh] max-w-[90vw] rounded-lg shadow-2xl"
          >
            Your browser does not support video playback.
          </video>
        )}
      </div>

      {/* Bottom info bar */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center justify-center bg-gradient-to-t from-black/80 to-transparent">
        <span className="text-white/60 text-sm">
          Press Esc to close • Click outside to dismiss
        </span>
      </div>
    </div>
  );
}

// Utility functions
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
