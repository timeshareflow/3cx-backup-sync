"use client";

import { useState, useCallback } from "react";
import {
  FileText,
  Download,
  Printer,
  Loader2,
  Phone,
  Mic,
  Voicemail,
  FileImage,
  MessageSquare,
  Video,
  Calendar,
  Filter,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format } from "date-fns";
import { generatePDF, formatDuration, formatFileSize } from "@/lib/pdf";

type ReportType = "call_logs" | "recordings" | "voicemails" | "faxes" | "messages" | "meetings";

interface ReportStats {
  total: number;
  [key: string]: number | string;
}

interface ReportData {
  data: Record<string, unknown>[];
  total: number;
  stats: ReportStats | null;
  report_type: ReportType;
  date_range: { start: string | null; end: string | null };
  generated_at: string;
}

const REPORT_TYPES: { value: ReportType; label: string; icon: React.ReactNode }[] = [
  { value: "call_logs", label: "Call Logs", icon: <Phone className="h-4 w-4" /> },
  { value: "recordings", label: "Recordings", icon: <Mic className="h-4 w-4" /> },
  { value: "voicemails", label: "Voicemails", icon: <Voicemail className="h-4 w-4" /> },
  { value: "faxes", label: "Faxes", icon: <FileImage className="h-4 w-4" /> },
  { value: "messages", label: "Messages", icon: <MessageSquare className="h-4 w-4" /> },
  { value: "meetings", label: "Meetings", icon: <Video className="h-4 w-4" /> },
];

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("call_logs");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [direction, setDirection] = useState("");
  const [status, setStatus] = useState("");
  const [extension, setExtension] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  const generateReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        type: reportType,
        include_stats: "true",
        limit: "1000",
      });

      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      if (direction) params.set("direction", direction);
      if (status) params.set("status", status);
      if (extension) params.set("extension", extension);

      const response = await fetch(`/api/reports?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate report");
      }

      setReportData(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [reportType, startDate, endDate, direction, status, extension]);

  const handleExportPDF = async () => {
    if (!reportData) return;

    setIsExporting(true);
    try {
      const filename = `${reportType}_report_${format(new Date(), "yyyy-MM-dd")}.pdf`;
      await generatePDF("report-content", { filename, orientation: "landscape" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    if (!reportData) return;

    const params = new URLSearchParams({
      type: reportType,
      format: "csv",
    });

    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (direction) params.set("direction", direction);
    if (status) params.set("status", status);
    if (extension) params.set("extension", extension);

    window.location.href = `/api/export?${params}`;
  };

  const handleExportJSON = async () => {
    if (!reportData) return;

    const params = new URLSearchParams({
      type: reportType,
      format: "json",
    });

    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (direction) params.set("direction", direction);
    if (status) params.set("status", status);
    if (extension) params.set("extension", extension);

    window.location.href = `/api/export?${params}`;
  };

  const handlePrint = () => {
    window.print();
  };

  const renderStats = () => {
    if (!reportData?.stats) return null;

    const stats = reportData.stats;
    const statItems: { label: string; value: string | number }[] = [];

    switch (reportType) {
      case "call_logs":
        statItems.push(
          { label: "Total Calls", value: stats.total },
          { label: "Inbound", value: stats.inbound || 0 },
          { label: "Outbound", value: stats.outbound || 0 },
          { label: "Internal", value: stats.internal || 0 },
          { label: "Answered", value: stats.answered || 0 },
          { label: "Missed", value: stats.missed || 0 },
          { label: "Avg Duration", value: formatDuration(Number(stats.avg_duration) || 0) },
          { label: "With Recording", value: stats.with_recording || 0 }
        );
        break;
      case "recordings":
        statItems.push(
          { label: "Total Recordings", value: stats.total },
          { label: "Inbound", value: stats.inbound || 0 },
          { label: "Outbound", value: stats.outbound || 0 },
          { label: "Total Duration", value: formatDuration(Number(stats.total_duration) || 0) },
          { label: "Avg Duration", value: formatDuration(Number(stats.avg_duration) || 0) },
          { label: "Total Size", value: formatFileSize(Number(stats.total_size) || 0) }
        );
        break;
      case "voicemails":
        statItems.push(
          { label: "Total Voicemails", value: stats.total },
          { label: "Read", value: stats.read || 0 },
          { label: "Unread", value: stats.unread || 0 },
          { label: "Total Duration", value: formatDuration(Number(stats.total_duration) || 0) },
          { label: "Avg Duration", value: formatDuration(Number(stats.avg_duration) || 0) }
        );
        break;
      case "faxes":
        statItems.push(
          { label: "Total Faxes", value: stats.total },
          { label: "Sent", value: stats.sent || 0 },
          { label: "Received", value: stats.received || 0 },
          { label: "Total Pages", value: stats.total_pages || 0 },
          { label: "Success", value: stats.success || 0 },
          { label: "Failed", value: stats.failed || 0 }
        );
        break;
      case "messages":
        statItems.push(
          { label: "Total Messages", value: stats.total },
          { label: "With Media", value: stats.with_media || 0 },
          { label: "Unique Senders", value: stats.unique_senders || 0 },
          { label: "Conversations", value: stats.unique_conversations || 0 }
        );
        break;
      case "meetings":
        statItems.push(
          { label: "Total Meetings", value: stats.total },
          { label: "Total Duration", value: formatDuration(Number(stats.total_duration) || 0) },
          { label: "Avg Duration", value: formatDuration(Number(stats.avg_duration) || 0) },
          { label: "Avg Participants", value: stats.avg_participants || 0 },
          { label: "With Video", value: stats.with_video || 0 }
        );
        break;
    }

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
        {statItems.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-slate-800">{stat.value}</div>
            <div className="text-xs text-slate-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderTable = () => {
    if (!reportData?.data || reportData.data.length === 0) {
      return (
        <div className="text-center py-12 text-slate-500">
          No data found for the selected criteria.
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {getTableHeaders().map((header, index) => (
                <th
                  key={index}
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reportData.data.map((row, index) => (
              <tr key={index} className="hover:bg-slate-50">
                {getTableCells(row).map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-3 text-sm text-slate-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const getTableHeaders = (): string[] => {
    switch (reportType) {
      case "call_logs":
        return ["Date/Time", "Direction", "Caller", "Callee", "Duration", "Status", "Recording"];
      case "recordings":
        return ["Date/Time", "Direction", "Caller", "Callee", "Duration", "Size"];
      case "voicemails":
        return ["Date/Time", "Extension", "Caller", "Duration", "Read"];
      case "faxes":
        return ["Date/Time", "Direction", "Extension", "Remote Number", "Pages", "Status"];
      case "messages":
        return ["Date/Time", "Conversation", "Sender", "Content", "Media"];
      case "meetings":
        return ["Date/Time", "Meeting Name", "Host", "Participants", "Duration", "Video"];
      default:
        return [];
    }
  };

  const getTableCells = (row: Record<string, unknown>): React.ReactNode[] => {
    switch (reportType) {
      case "call_logs":
        return [
          formatDateTime(row.started_at as string),
          formatDirection(row.direction as string),
          `${String(row.caller_name || "")} ${String(row.caller_number || "Unknown")}`.trim(),
          `${String(row.callee_name || "")} ${String(row.callee_number || "Unknown")}`.trim(),
          formatDuration(Number(row.duration_seconds) || 0),
          formatStatus(row.status as string),
          row.recording_id ? "Yes" : "No",
        ];
      case "recordings":
        return [
          formatDateTime(row.started_at as string),
          formatDirection(row.direction as string),
          `${String(row.caller_name || "")} ${String(row.caller_number || "Unknown")}`.trim(),
          `${String(row.callee_name || "")} ${String(row.callee_number || "Unknown")}`.trim(),
          formatDuration(Number(row.duration_seconds) || 0),
          formatFileSize(Number(row.file_size) || 0),
        ];
      case "voicemails":
        // eslint-disable-next-line no-case-declarations
        const ext = row.extensions as Record<string, string> | null;
        return [
          formatDateTime(row.received_at as string),
          String(ext?.extension_number || "Unknown"),
          `${String(row.caller_name || "")} ${String(row.caller_number || "Unknown")}`.trim(),
          formatDuration(Number(row.duration_seconds) || 0),
          row.is_read ? "Yes" : "No",
        ];
      case "faxes":
        return [
          formatDateTime(row.sent_received_at as string),
          formatDirection(row.direction as string),
          String(row.extension_number || "Unknown"),
          String(row.remote_number || "Unknown"),
          String(row.page_count || 0),
          formatStatus(row.status as string),
        ];
      case "messages":
        return [
          formatDateTime(row.sent_at as string),
          String(row.conversation_name || "Unknown"),
          String(row.sender_name || row.sender_identifier || "Unknown"),
          truncateText(row.content as string, 50),
          row.has_media ? "Yes" : "No",
        ];
      case "meetings":
        return [
          formatDateTime((row.meeting_started_at || row.uploaded_at) as string),
          String(row.meeting_name || "Untitled"),
          String(row.meeting_host || row.host_extension || "Unknown"),
          String(row.participant_count || 0),
          formatDuration(Number(row.duration_seconds) || 0),
          row.has_video ? "Yes" : "No",
        ];
      default:
        return [];
    }
  };

  const formatDateTime = (dateStr: string | null): string => {
    if (!dateStr) return "--";
    try {
      return format(new Date(dateStr), "MMM d, yyyy HH:mm");
    } catch {
      return "--";
    }
  };

  const formatDirection = (direction: string | null): React.ReactNode => {
    if (!direction) return "--";
    const colors: Record<string, string> = {
      inbound: "bg-green-100 text-green-800",
      outbound: "bg-blue-100 text-blue-800",
      internal: "bg-purple-100 text-purple-800",
      sent: "bg-blue-100 text-blue-800",
      received: "bg-green-100 text-green-800",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[direction] || "bg-slate-100 text-slate-800"}`}>
        {direction.charAt(0).toUpperCase() + direction.slice(1)}
      </span>
    );
  };

  const formatStatus = (status: string | null): React.ReactNode => {
    if (!status) return "--";
    const colors: Record<string, string> = {
      answered: "bg-green-100 text-green-800",
      completed: "bg-green-100 text-green-800",
      success: "bg-green-100 text-green-800",
      missed: "bg-red-100 text-red-800",
      no_answer: "bg-red-100 text-red-800",
      failed: "bg-red-100 text-red-800",
      busy: "bg-yellow-100 text-yellow-800",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || "bg-slate-100 text-slate-800"}`}>
        {status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ")}
      </span>
    );
  };

  const truncateText = (text: string | null, maxLength: number): string => {
    if (!text) return "--";
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  const showDirectionFilter = ["call_logs", "recordings", "faxes"].includes(reportType);
  const showStatusFilter = reportType === "call_logs";

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
          <p className="text-slate-500 mt-1">Generate and export reports for your data</p>
        </div>
        {reportData && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              JSON
            </button>
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 text-white bg-teal-500 rounded-lg hover:bg-teal-600 disabled:opacity-50 transition-colors"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              PDF
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 no-print">
        <div className="flex flex-wrap items-end gap-4">
          {/* Report Type */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-2">Report Type</label>
            <div className="relative">
              <select
                value={reportType}
                onChange={(e) => {
                  setReportType(e.target.value as ReportType);
                  setReportData(null);
                }}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none text-slate-800"
              >
                {REPORT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                {REPORT_TYPES.find((t) => t.value === reportType)?.icon}
              </div>
            </div>
          </div>

          {/* Date Range */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-slate-700 mb-2">Start Date</label>
            <div className="relative">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-800"
              />
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            </div>
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-slate-700 mb-2">End Date</label>
            <div className="relative">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-800"
              />
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            </div>
          </div>

          {/* More Filters Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2.5 text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
          >
            <Filter className="h-4 w-4" />
            Filters
            {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {/* Generate Button */}
          <button
            onClick={generateReport}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-2.5 bg-teal-500 text-white rounded-xl font-medium hover:bg-teal-600 disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Generate Report
              </>
            )}
          </button>
        </div>

        {/* Additional Filters */}
        {showFilters && (
          <div className="flex flex-wrap items-end gap-4 mt-4 pt-4 border-t border-slate-100">
            {showDirectionFilter && (
              <div className="min-w-[150px]">
                <label className="block text-sm font-medium text-slate-700 mb-2">Direction</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-800"
                >
                  <option value="">All Directions</option>
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                  <option value="internal">Internal</option>
                </select>
              </div>
            )}

            {showStatusFilter && (
              <div className="min-w-[150px]">
                <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-800"
                >
                  <option value="">All Statuses</option>
                  <option value="answered">Answered</option>
                  <option value="missed">Missed</option>
                  <option value="busy">Busy</option>
                </select>
              </div>
            )}

            <div className="min-w-[150px]">
              <label className="block text-sm font-medium text-slate-700 mb-2">Extension</label>
              <input
                type="text"
                value={extension}
                onChange={(e) => setExtension(e.target.value)}
                placeholder="e.g. 101"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-800 placeholder-slate-400"
              />
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 no-print">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Report Content - this is what gets exported to PDF */}
      <div id="report-content" className="print-container">
        {/* Report Header (visible in print/PDF) */}
        {reportData && (
          <div className="hidden print-block mb-6">
            <h1 className="text-2xl font-bold text-slate-800">
              {REPORT_TYPES.find((t) => t.value === reportType)?.label} Report
            </h1>
            <p className="text-slate-500 mt-1">
              {reportData.date_range.start && reportData.date_range.end
                ? `${format(new Date(reportData.date_range.start), "MMM d, yyyy")} - ${format(new Date(reportData.date_range.end), "MMM d, yyyy")}`
                : "All Time"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Generated: {format(new Date(reportData.generated_at), "MMM d, yyyy HH:mm")}
            </p>
          </div>
        )}

        {/* Statistics */}
        {reportData && renderStats()}

        {/* Data Table */}
        {reportData && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 no-print">
              <h3 className="font-semibold text-slate-800">
                {REPORT_TYPES.find((t) => t.value === reportType)?.label} ({reportData.total} records)
              </h3>
            </div>
            {renderTable()}
          </div>
        )}

        {/* Empty State */}
        {!reportData && !isLoading && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
              <FileText className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Generate a Report</h3>
            <p className="text-slate-500 max-w-md mx-auto">
              Select a report type, choose your date range and filters, then click &quot;Generate Report&quot; to view your data.
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 text-teal-500 animate-spin" />
          </div>
        )}

        {/* Print Footer */}
        {reportData && (
          <div className="hidden print-block mt-6 pt-4 border-t border-slate-200 text-xs text-slate-400 text-center">
            Generated by 3CX Backup Wizard | {format(new Date(), "MMMM d, yyyy 'at' HH:mm")}
          </div>
        )}
      </div>
    </div>
  );
}
