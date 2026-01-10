"use client";

import { useEffect, useState } from "react";
import { Users, Mail, CheckCircle, XCircle, Eye, EyeOff, Search } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { Input } from "@/components/ui/Input";
import type { Extension } from "@/types";

function ExtensionCard({ extension }: { extension: Extension }) {
  const displayName = extension.display_name ||
    `${extension.first_name || ""} ${extension.last_name || ""}`.trim() ||
    "Unknown";

  const initial = displayName.charAt(0).toUpperCase();
  const isRegistered = extension.is_active;

  return (
    <div className={`block p-3 bg-gradient-to-br from-slate-50 to-white rounded-xl border transition-all ${
      isRegistered
        ? "border-slate-200 hover:border-teal-300 hover:shadow-md"
        : "border-slate-200 opacity-60 hover:opacity-100 hover:border-slate-300"
    }`}>
      <div className="flex flex-col items-center text-center">
        {/* Avatar */}
        <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white text-lg font-bold mb-2 ${
          isRegistered
            ? "bg-gradient-to-br from-teal-500 to-cyan-600"
            : "bg-gradient-to-br from-slate-400 to-slate-500"
        }`}>
          {initial}
        </div>

        {/* Extension Number Badge */}
        <div className={`px-2 py-0.5 rounded-full text-xs font-semibold mb-1 ${
          isRegistered
            ? "bg-teal-100 text-teal-700"
            : "bg-slate-100 text-slate-500"
        }`}>
          Ext. {extension.extension_number}
        </div>

        {/* Name */}
        <p className="font-medium text-slate-800 text-sm truncate w-full">
          {displayName}
        </p>

        {/* Email if available */}
        {extension.email && (
          <p className="text-xs text-slate-500 truncate w-full flex items-center justify-center gap-1 mt-0.5">
            <Mail className="h-3 w-3" />
            {extension.email}
          </p>
        )}

        {/* Status indicator */}
        <div className="flex items-center gap-1 mt-2">
          {isRegistered ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle className="h-3 w-3" />
              Registered
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <XCircle className="h-3 w-3" />
              Unregistered
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ExtensionsPage() {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUnregistered, setShowUnregistered] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchExtensions();
  }, []);

  const fetchExtensions = async () => {
    try {
      const response = await fetch("/api/extensions");
      if (response.ok) {
        const data = await response.json();
        setExtensions(data);
      }
    } catch (error) {
      console.error("Failed to fetch extensions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter extensions
  const filteredExtensions = extensions.filter((ext) => {
    // Filter by registration status
    if (!showUnregistered && !ext.is_active) {
      return false;
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const displayName = ext.display_name ||
        `${ext.first_name || ""} ${ext.last_name || ""}`.trim();
      return (
        ext.extension_number.toLowerCase().includes(query) ||
        displayName.toLowerCase().includes(query) ||
        (ext.email && ext.email.toLowerCase().includes(query))
      );
    }

    return true;
  });

  // Sort: registered first, then by extension number
  const sortedExtensions = [...filteredExtensions].sort((a, b) => {
    if (a.is_active !== b.is_active) {
      return a.is_active ? -1 : 1;
    }
    return a.extension_number.localeCompare(b.extension_number, undefined, { numeric: true });
  });

  const registeredCount = extensions.filter(e => e.is_active).length;
  const unregisteredCount = extensions.filter(e => !e.is_active).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/25">
            <Users className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Extensions</h1>
            <p className="text-slate-500 mt-1">
              {registeredCount} registered, {unregisteredCount} unregistered
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input
            placeholder="Search extensions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Toggle unregistered */}
        <button
          onClick={() => setShowUnregistered(!showUnregistered)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            showUnregistered
              ? "bg-teal-100 text-teal-700 hover:bg-teal-200"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {showUnregistered ? (
            <>
              <Eye className="h-4 w-4" />
              Showing Unregistered
            </>
          ) : (
            <>
              <EyeOff className="h-4 w-4" />
              Hiding Unregistered
            </>
          )}
        </button>
      </div>

      {/* Extensions Grid */}
      {sortedExtensions.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-12 text-center">
          <div className="p-4 bg-slate-100 rounded-full inline-block mb-4">
            <Users className="h-12 w-12 text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">
            {extensions.length === 0 ? "No extensions found" : "No matching extensions"}
          </h2>
          <p className="text-slate-500 mt-2 max-w-md mx-auto">
            {extensions.length === 0
              ? "Extensions will appear here after the sync service runs."
              : "Try adjusting your search or filter settings."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {sortedExtensions.map((ext) => (
            <ExtensionCard key={ext.id} extension={ext} />
          ))}
        </div>
      )}
    </div>
  );
}
