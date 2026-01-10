"use client";

import { useEffect, useState } from "react";
import { Users, Phone, Mail, CheckCircle, XCircle } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { formatRelativeTime } from "@/lib/utils/date";
import type { Extension } from "@/types";

export default function ExtensionsPage() {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchExtensions();
  }, []);

  const fetchExtensions = async () => {
    try {
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to fetch extensions:", error);
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/25">
          <Users className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Extensions</h1>
          <p className="text-slate-500 mt-1">View all synced 3CX extensions and users</p>
        </div>
      </div>

      {extensions.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 p-12 text-center">
          <div className="p-4 bg-slate-100 rounded-full inline-block mb-4">
            <Users className="h-12 w-12 text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">No extensions found</h2>
          <p className="text-slate-500 mt-2 max-w-md mx-auto">
            Extensions will appear here after the sync service runs.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gradient-to-br from-slate-50 to-gray-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Extension
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Last Synced
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {extensions.map((ext) => (
                <tr key={ext.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-teal-100 rounded-lg">
                        <Phone className="h-4 w-4 text-teal-600" />
                      </div>
                      <span className="font-semibold text-slate-800">{ext.extension_number}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-800 font-medium">
                    {ext.display_name || `${ext.first_name || ""} ${ext.last_name || ""}`.trim() || "-"}
                  </td>
                  <td className="px-6 py-4">
                    {ext.email ? (
                      <div className="flex items-center gap-2 text-slate-500">
                        <Mail className="h-4 w-4" />
                        {ext.email}
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {ext.is_active ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold">
                        <CheckCircle className="h-4 w-4" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-sm font-semibold">
                        <XCircle className="h-4 w-4" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {ext.last_synced_at
                      ? formatRelativeTime(ext.last_synced_at)
                      : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
