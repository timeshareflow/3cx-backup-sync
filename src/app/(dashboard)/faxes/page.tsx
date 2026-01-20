"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, ArrowDownLeft, ArrowUpRight, Download, Eye, Search, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface FaxRecord {
  id: string;
  extension_number: string | null;
  direction: string | null;
  remote_number: string | null;
  remote_name: string | null;
  pages: number | null;
  file_size: number | null;
  status: string | null;
  sent_received_at: string;
  storage_path: string;
}

type DirectionFilter = "all" | "inbound" | "outbound";

export default function FaxesPage() {
  const [faxes, setFaxes] = useState<FaxRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<DirectionFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchFaxes = useCallback(async (pageNum: number, direction: DirectionFilter, search: string, append = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        page_size: "20",
      });

      if (direction !== "all") {
        params.set("direction", direction);
      }

      if (search) {
        params.set("search", search);
      }

      const response = await fetch(`/api/faxes?${params}`);
      if (!response.ok) throw new Error("Failed to fetch faxes");

      const data = await response.json();

      if (append) {
        setFaxes((prev) => [...prev, ...data.data]);
      } else {
        setFaxes(data.data);
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
    fetchFaxes(1, filter, searchQuery);
  }, [filter, searchQuery, fetchFaxes]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchFaxes(nextPage, filter, searchQuery, true);
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return "Unknown";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDirectionIcon = (direction: string | null) => {
    switch (direction) {
      case "inbound":
        return <ArrowDownLeft className="h-4 w-4 text-green-500" />;
      case "outbound":
        return <ArrowUpRight className="h-4 w-4 text-blue-500" />;
      default:
        return <FileText className="h-4 w-4 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: string | null) => {
    const styles: Record<string, string> = {
      completed: "bg-emerald-100 text-emerald-700",
      failed: "bg-red-100 text-red-700",
      pending: "bg-yellow-100 text-yellow-700",
    };

    return (
      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${styles[status || ""] || "bg-slate-100 text-slate-600"}`}>
        {status || "Unknown"}
      </span>
    );
  };

  const filterOptions: { value: DirectionFilter; label: string }[] = [
    { value: "all", label: "All Faxes" },
    { value: "inbound", label: "Received" },
    { value: "outbound", label: "Sent" },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Faxes</h1>
          <p className="text-slate-500 mt-1">
            {total} faxes synced from 3CX
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by number or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === option.value
                    ? "bg-white text-teal-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && faxes.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-teal-500 animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && faxes.length === 0 && (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
            <FileText className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">No faxes found</h3>
          <p className="text-slate-500">
            Faxes from 3CX will appear here once synced.
          </p>
        </div>
      )}

      {/* Faxes Table */}
      {faxes.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Direction</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Remote</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Extension</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Pages</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Size</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {faxes.map((fax) => (
                <tr key={fax.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {getDirectionIcon(fax.direction)}
                      <span className="text-sm text-slate-600 capitalize">
                        {fax.direction === "inbound" ? "Received" : fax.direction === "outbound" ? "Sent" : "Unknown"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{fax.remote_name || fax.remote_number || "Unknown"}</p>
                      {fax.remote_name && fax.remote_number && (
                        <p className="text-xs text-slate-500">{fax.remote_number}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{fax.extension_number || "-"}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{fax.pages || "-"}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{formatFileSize(fax.file_size)}</td>
                  <td className="px-6 py-4">{getStatusBadge(fax.status)}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {formatDistanceToNow(new Date(fax.sent_received_at), { addSuffix: true })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
}
