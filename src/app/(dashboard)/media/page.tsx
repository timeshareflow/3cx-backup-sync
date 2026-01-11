"use client";

import { useState, useEffect, useCallback } from "react";
import { Image, Video, FileText, Download, ZoomIn, X, Filter, Loader2 } from "lucide-react";
import type { MediaFile } from "@/types";

type FileTypeFilter = "all" | "image" | "video" | "audio" | "document";

export default function MediaGalleryPage() {
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<FileTypeFilter>("all");
  const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  const fetchMedia = useCallback(async (pageNum: number, fileType: FileTypeFilter, append = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        page_size: "24",
      });

      if (fileType !== "all") {
        params.set("file_type", fileType);
      }

      const response = await fetch(`/api/media?${params}`);
      if (!response.ok) throw new Error("Failed to fetch media");

      const data = await response.json();

      if (append) {
        setMediaFiles((prev) => [...prev, ...data.data]);
      } else {
        setMediaFiles(data.data);
      }

      setTotal(data.total);
      setHasMore(data.has_more);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    fetchMedia(1, filter);
  }, [filter, fetchMedia]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchMedia(nextPage, filter, true);
  };

  const openViewer = async (media: MediaFile) => {
    setSelectedMedia(media);
    try {
      const response = await fetch(`/api/media/${media.id}`);
      if (response.ok) {
        const data = await response.json();
        setMediaUrl(data.url);
      }
    } catch (error) {
      console.error("Failed to load media:", error);
    }
  };

  const closeViewer = () => {
    setSelectedMedia(null);
    setMediaUrl(null);
  };

  const getFileType = (mimeType: string | null): "image" | "video" | "audio" | "document" => {
    if (!mimeType) return "document";
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    return "document";
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filterOptions: { value: FileTypeFilter; label: string; icon: React.ReactNode }[] = [
    { value: "all", label: "All Files", icon: <Filter className="h-4 w-4" /> },
    { value: "image", label: "Images", icon: <Image className="h-4 w-4" /> },
    { value: "video", label: "Videos", icon: <Video className="h-4 w-4" /> },
    { value: "document", label: "Documents", icon: <FileText className="h-4 w-4" /> },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Media Gallery</h1>
          <p className="text-slate-500 mt-1">
            {total} files synced from 3CX
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === option.value
                  ? "bg-white text-teal-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && mediaFiles.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-teal-500 animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && mediaFiles.length === 0 && (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
            <Image className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">No media files found</h3>
          <p className="text-slate-500">
            Media files from 3CX chats will appear here once synced.
          </p>
        </div>
      )}

      {/* Media Grid */}
      {mediaFiles.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {mediaFiles.map((media) => {
            const fileType = getFileType(media.mime_type);

            return (
              <button
                key={media.id}
                onClick={() => openViewer(media)}
                className="group relative aspect-square bg-slate-100 rounded-xl overflow-hidden border border-slate-200 hover:border-teal-300 hover:shadow-lg transition-all"
              >
                {fileType === "image" ? (
                  <div className="w-full h-full flex items-center justify-center bg-slate-200">
                    <Image className="h-12 w-12 text-slate-400" />
                  </div>
                ) : fileType === "video" ? (
                  <div className="w-full h-full flex items-center justify-center bg-slate-800">
                    <Video className="h-12 w-12 text-white" />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-100">
                    <FileText className="h-12 w-12 text-slate-400" />
                  </div>
                )}

                {/* Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* File info */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <p className="text-white text-xs truncate">
                    {media.file_name || "Unknown"}
                  </p>
                  <p className="text-white/70 text-xs">
                    {formatFileSize(media.file_size)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center mt-8">
          <button
            onClick={loadMore}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-3 bg-teal-500 text-white rounded-xl font-medium hover:bg-teal-600 disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Load More"
            )}
          </button>
        </div>
      )}

      {/* Media Viewer Modal */}
      {selectedMedia && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={closeViewer}
        >
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent">
            <div>
              <p className="text-white font-medium">{selectedMedia.file_name}</p>
              <p className="text-white/60 text-sm">{formatFileSize(selectedMedia.file_size)}</p>
            </div>
            <div className="flex items-center gap-2">
              {mediaUrl && (
                <a
                  href={mediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 text-white hover:bg-white/20 rounded-lg"
                >
                  <Download className="h-5 w-5" />
                </a>
              )}
              <button
                onClick={closeViewer}
                className="p-2 text-white hover:bg-white/20 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div
            className="max-w-[90vw] max-h-[90vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {!mediaUrl ? (
              <Loader2 className="h-12 w-12 text-white animate-spin" />
            ) : getFileType(selectedMedia.mime_type) === "image" ? (
              <img
                src={mediaUrl}
                alt={selectedMedia.file_name || "Image"}
                className="max-w-full max-h-[80vh] object-contain rounded-lg"
              />
            ) : getFileType(selectedMedia.mime_type) === "video" ? (
              <video
                src={mediaUrl}
                controls
                autoPlay
                className="max-w-full max-h-[80vh] rounded-lg"
              />
            ) : getFileType(selectedMedia.mime_type) === "audio" ? (
              <div className="bg-white rounded-xl p-8">
                <audio src={mediaUrl} controls autoPlay className="w-96" />
              </div>
            ) : (
              <div className="bg-white rounded-xl p-8 text-center">
                <FileText className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-800 font-medium mb-2">
                  {selectedMedia.file_name}
                </p>
                <a
                  href={mediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
