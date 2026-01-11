"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchFiltersPanel, type SearchFilters } from "@/components/search/SearchFilters";
import { SearchResults } from "@/components/search/SearchResults";
import type { MessageWithMedia, Extension } from "@/types";

export function SearchPageContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<MessageWithMedia[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [filters, setFilters] = useState<SearchFilters>({
    startDate: "",
    endDate: "",
    sender: "",
    hasMedia: null,
    conversationId: "",
    channelType: "",
  });

  // Fetch extensions for filter dropdown
  useEffect(() => {
    fetch("/api/sync/status")
      .then((res) => res.json())
      .then(() => {
        // In a real app, you'd have an extensions endpoint
        // For now, we'll leave this empty
      })
      .catch(console.error);
  }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    // Allow search with date filters even without text query
    const hasFilters = filters.startDate || filters.endDate || filters.channelType;
    if (!hasFilters && (!searchQuery || searchQuery.trim().length < 2)) {
      setResults([]);
      setTotalCount(0);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery && searchQuery.trim()) {
        params.set("q", searchQuery);
      }
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
        setResults(data.data || []);
        setTotalCount(data.total || 0);
      } else {
        console.error("Search error:", data.error);
        setResults([]);
      }
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  // Search when query or filters change
  useEffect(() => {
    const hasFilters = filters.startDate || filters.endDate || filters.channelType;
    if (query || hasFilters) {
      performSearch(query);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Search Messages</h1>
        <p className="text-gray-600">Search through all archived conversations</p>
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
          />
        </div>
      </div>
    </div>
  );
}
