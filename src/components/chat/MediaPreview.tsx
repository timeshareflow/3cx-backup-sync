"use client";

import { useState } from "react";
import { Play, FileText, Download, X, ZoomIn, ZoomOut } from "lucide-react";
import type { MediaFile } from "@/types";

interface MediaPreviewProps {
  media: MediaFile;
}

// Helper to determine file type from mime_type
function getFileType(mimeType: string | null): "image" | "video" | "document" {
  if (!mimeType) return "document";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
}

export function MediaPreview({ media }: MediaPreviewProps) {
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fileType = getFileType(media.mime_type);

  const fetchMediaUrl = async () => {
    if (imageUrl) return imageUrl;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/media/${media.id}`);
      if (response.ok) {
        const data = await response.json();
        setImageUrl(data.url);
        return data.url;
      }
    } catch (error) {
      console.error("Failed to fetch media URL:", error);
    } finally {
      setIsLoading(false);
    }
    return null;
  };

  const handleClick = async () => {
    await fetchMediaUrl();
    setIsViewerOpen(true);
  };

  const handleDownload = async () => {
    const url = await fetchMediaUrl();
    if (url) {
      window.open(url, "_blank");
    }
  };

  // Render based on file type
  if (fileType === "image") {
    return (
      <>
        <button
          onClick={handleClick}
          className="relative group cursor-pointer overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
          style={{
            width: Math.min(media.width || 200, 300),
            height: Math.min(media.height || 150, 200),
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={media.original_filename || "Image"}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {isLoading ? (
                <div className="animate-pulse bg-gray-200 w-full h-full" />
              ) : (
                <span className="text-gray-400">Click to load</span>
              )}
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>

        <ImageViewer
          isOpen={isViewerOpen}
          onClose={() => setIsViewerOpen(false)}
          url={imageUrl}
          filename={media.original_filename}
        />
      </>
    );
  }

  if (fileType === "video") {
    return (
      <>
        <button
          onClick={handleClick}
          className="relative group cursor-pointer overflow-hidden rounded-lg border border-gray-200 bg-gray-900"
          style={{ width: 300, height: 200 }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-14 w-14 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="h-8 w-8 text-gray-900 ml-1" />
            </div>
          </div>
          {media.duration_seconds && (
            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
              {formatDuration(media.duration_seconds)}
            </div>
          )}
        </button>

        <VideoPlayer
          isOpen={isViewerOpen}
          onClose={() => setIsViewerOpen(false)}
          url={imageUrl}
          filename={media.original_filename}
        />
      </>
    );
  }

  // Document / other file types
  return (
    <button
      onClick={handleDownload}
      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
    >
      <FileText className="h-8 w-8 text-gray-400" />
      <div className="text-left">
        <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
          {media.original_filename || "Document"}
        </p>
        {media.file_size && (
          <p className="text-xs text-gray-500">
            {formatFileSize(media.file_size)}
          </p>
        )}
      </div>
      <Download className="h-4 w-4 text-gray-400" />
    </button>
  );
}

// Image Viewer Modal
function ImageViewer({
  isOpen,
  onClose,
  url,
  filename,
}: {
  isOpen: boolean;
  onClose: () => void;
  url: string | null;
  filename: string | null;
}) {
  const [zoom, setZoom] = useState(1);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90" onClick={onClose}>
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent">
        <span className="text-white text-sm">{filename}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoom((z) => Math.max(0.5, z - 0.25));
            }}
            className="p-2 text-white hover:bg-white/20 rounded-lg"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <span className="text-white text-sm">{Math.round(zoom * 100)}%</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoom((z) => Math.min(3, z + 0.25));
            }}
            className="p-2 text-white hover:bg-white/20 rounded-lg"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-white hover:bg-white/20 rounded-lg ml-4"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image */}
      <div
        className="flex items-center justify-center h-full p-16"
        onClick={(e) => e.stopPropagation()}
      >
        {url && (
          <img
            src={url}
            alt={filename || "Image"}
            className="max-h-full max-w-full object-contain transition-transform"
            style={{ transform: `scale(${zoom})` }}
          />
        )}
      </div>
    </div>
  );
}

// Video Player Modal
function VideoPlayer({
  isOpen,
  onClose,
  url,
  filename,
}: {
  isOpen: boolean;
  onClose: () => void;
  url: string | null;
  filename: string | null;
}) {
  if (!isOpen || !url) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={onClose}>
      <div className="absolute top-4 right-4">
        <button onClick={onClose} className="p-2 text-white hover:bg-white/20 rounded-lg">
          <X className="h-6 w-6" />
        </button>
      </div>
      <video
        src={url}
        controls
        autoPlay
        className="max-h-[90vh] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        Your browser does not support video playback.
      </video>
    </div>
  );
}

// Utility functions
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
