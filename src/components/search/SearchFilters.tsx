"use client";

import { useState } from "react";
import { Filter, ChevronDown, X } from "lucide-react";
import { DateRangePicker } from "@/components/ui/DatePicker";

export interface SearchFilters {
  startDate: string;
  endDate: string;
  sender: string;
  hasMedia: boolean | null;
  conversationId: string;
}

interface SearchFiltersProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  extensions?: Array<{ extension_number: string; display_name: string | null }>;
}

export function SearchFiltersPanel({
  filters,
  onFiltersChange,
  extensions = [],
}: SearchFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const activeFilterCount = [
    filters.startDate,
    filters.endDate,
    filters.sender,
    filters.hasMedia !== null,
    filters.conversationId,
  ].filter(Boolean).length;

  const clearFilters = () => {
    onFiltersChange({
      startDate: "",
      endDate: "",
      sender: "",
      hasMedia: null,
      conversationId: "",
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4"
      >
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-gray-500" />
          <span className="font-medium">Filters</span>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-sm rounded-full">
              {activeFilterCount}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-5 w-5 text-gray-400 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {isExpanded && (
        <div className="p-4 border-t border-gray-200 space-y-4">
          {/* Date Range */}
          <DateRangePicker
            startDate={filters.startDate}
            endDate={filters.endDate}
            onStartDateChange={(date) =>
              onFiltersChange({ ...filters, startDate: date })
            }
            onEndDateChange={(date) =>
              onFiltersChange({ ...filters, endDate: date })
            }
          />

          {/* Sender Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sender
            </label>
            <select
              value={filters.sender}
              onChange={(e) =>
                onFiltersChange({ ...filters, sender: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All senders</option>
              {extensions.map((ext) => (
                <option key={ext.extension_number} value={ext.extension_number}>
                  {ext.display_name || ext.extension_number} ({ext.extension_number})
                </option>
              ))}
            </select>
          </div>

          {/* Media Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Media
            </label>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    hasMedia: filters.hasMedia === null ? null : null,
                  })
                }
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  filters.hasMedia === null
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All
              </button>
              <button
                onClick={() => onFiltersChange({ ...filters, hasMedia: true })}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  filters.hasMedia === true
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                With Media
              </button>
              <button
                onClick={() => onFiltersChange({ ...filters, hasMedia: false })}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  filters.hasMedia === false
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Text Only
              </button>
            </div>
          </div>

          {/* Clear Filters */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
            >
              <X className="h-4 w-4" />
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
