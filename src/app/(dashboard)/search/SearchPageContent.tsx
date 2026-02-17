"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchFiltersPanel, type SearchFilters } from "@/components/search/SearchFilters";
import { SearchResults } from "@/components/search/SearchResults";
import { Search as SearchIcon } from "lucide-react";
import type { MessageWithMedia, Extension } from "@/types";

export function SearchPageContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<MessageWithMedia[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [filters, setFilters] = useState<SearchFilters>({
    startDate: "",
    endDate: "",
    sender: "",
    hasMedia: null,
    conversationId: "",
    channelType: "",
  });

  // Fetch extensions for sender filter dropdown
  useEffect(() => {
    fetch("/api/extensions")
      .then((res) => res.json())
      .then((data) => setExtensions(data || []))
      .catch(console.error);
  }, []);

  const performSearch = useCallback(async (searchQuery: string, pageNum: number = 1) => {
    const hasFilters = filters.startDate || filters.endDate || filters.channelType;
    if (!hasFilters && (!searchQuery || searchQuery.trim().length < 2)) {
      setResults([]);
      setTotalCount(0);
      setHasMore(false);
      return;
    }

    if (pageNum === 1) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const params = new URLSearchParams();
      if (searchQuery && searchQuery.trim()) {
        params.set("q", searchQuery);
      }
      params.set("page", String(pageNum));
      params.set("limit", "50");

      if (filters.startDate) params.set("start_date", filters.startDate);
      if (filters.endDate) params.set("end_date", filters.endDate);
      if (filters.sender) params.set("sender", filters.sender);
      if (filters.hasMedia !== null) params.set("has_media", String(filters.hasMedia));
      if (filters.conversationId) params.set("conversation_id", filters.conversationId);
      if (filters.channelType) params.set("channel_type", filters.channelType);

      const response = await fetch(`/api/search?${params.toString()}`);
      const data = await response.json();

      if (response.ok) {
        const newResults = data.data || [];
        if (pageNum === 1) {
          setResults(newResults);
        } else {
          setResults((prev) => [...prev, ...newResults]);
        }
        setTotalCount(data.total || 0);
        setPage(pageNum);
        setHasMore(data.has_more || false);
      } else {
        console.error("Search error:", data.error);
        if (pageNum === 1) setResults([]);
      }
    } catch (error) {
      console.error("Search failed:", error);
      if (pageNum === 1) setResults([]);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [filters]);

  // Search when query or filters change (reset to page 1)
  useEffect(() => {
    const hasFilters = filters.startDate || filters.endDate || filters.channelType;
    if (query || hasFilters) {
      performSearch(query, 1);
    }
  }, [query, filters, performSearch]);

  // Handle search from URL params on initial load
  useEffect(() => {
    if (initialQuery && initialQuery !== query) {
      setQuery(initialQuery);
    }
  }, [initialQuery, query]);

  const handleSearch = (newQuery: string) => {
    setQuery(newQuery);
  };

  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) {
      performSearch(query, page + 1);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl shadow-lg shadow-teal-500/25">
          <SearchIcon className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Search Messages</h1>
          <p className="text-slate-500 mt-1">Search through all archived conversations</p>
        </div>
      </div>

      <SearchBar
        placeholder="Search messages, names, or content..."
        autoFocus
        onSearch={handleSearch}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <SearchFiltersPanel
            filters={filters}
            onFiltersChange={setFilters}
            extensions={extensions}
          />
        </div>

        <div className="lg:col-span-3">
          <SearchResults
            results={results}
            isLoading={isLoading}
            query={query}
            totalCount={totalCount}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={handleLoadMore}
          />
        </div>
      </div>
    </div>
  );
}
