"use client";

import { useState, useEffect } from "react";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Clock,
  Users,
  TrendingUp,
  Calendar,
} from "lucide-react";

interface CallStats {
  totalCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  internalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  avgTalkDuration: number;
  avgRingDuration: number;
  totalTalkTime: number;
}

interface DailyCallVolume {
  date: string;
  inbound: number;
  outbound: number;
  internal: number;
  total: number;
}

interface HourlyDistribution {
  hour: number;
  calls: number;
}

interface ExtensionStats {
  extension: string;
  name: string | null;
  totalCalls: number;
  inbound: number;
  outbound: number;
  avgTalkDuration: number;
}

interface QueueStats {
  queueName: string;
  totalCalls: number;
  answered: number;
  abandoned: number;
  avgWaitTime: number;
  avgTalkTime: number;
}

interface AnalyticsData {
  stats: CallStats | null;
  dailyVolume: DailyCallVolume[];
  hourlyDistribution: HourlyDistribution[];
  extensionStats: ExtensionStats[];
  queueStats: QueueStats[];
  period: { from: string; to: string };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = "blue",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: "blue" | "green" | "red" | "yellow" | "purple";
}) {
  const colorClasses = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    red: "bg-red-100 text-red-600",
    yellow: "bg-yellow-100 text-yellow-600",
    purple: "bg-purple-100 text-purple-600",
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

function BarChart({
  data,
  maxValue,
  label,
  color = "blue",
}: {
  data: { label: string; value: number }[];
  maxValue: number;
  label: string;
  color?: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <div className="space-y-1">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-16 text-right">{item.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
              <div
                className={`h-full bg-${color}-500 rounded-full transition-all`}
                style={{ width: maxValue > 0 ? `${(item.value / maxValue) * 100}%` : "0%" }}
              />
            </div>
            <span className="text-xs text-gray-600 w-12">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    async function fetchAnalytics() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("period", period);
        if (period === "custom" && customStart && customEnd) {
          params.set("start_date", customStart);
          params.set("end_date", customEnd);
        }

        const response = await fetch(`/api/analytics?${params.toString()}`);
        const result = await response.json();
        setData(result);
      } catch (error) {
        console.error("Failed to fetch analytics:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAnalytics();
  }, [period, customStart, customEnd]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Call Analytics</h1>
            <p className="text-gray-600">Loading analytics data...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
              <div className="h-20 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const stats = data?.stats;
  const answerRate = stats && stats.inboundCalls > 0
    ? Math.round((stats.answeredCalls / stats.inboundCalls) * 100)
    : 0;

  // Get max values for charts
  const maxDailyTotal = Math.max(...(data?.dailyVolume || []).map((d) => d.total), 1);
  const maxHourlyCalls = Math.max(...(data?.hourlyDistribution || []).map((h) => h.calls), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Call Analytics</h1>
          <p className="text-gray-600">
            {data?.period
              ? `${new Date(data.period.from).toLocaleDateString()} - ${new Date(data.period.to).toLocaleDateString()}`
              : "View call statistics and trends"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="custom">Custom Range</option>
          </select>
          {period === "custom" && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Calls"
          value={stats?.totalCalls.toLocaleString() || 0}
          icon={Phone}
          color="blue"
        />
        <StatCard
          title="Inbound Calls"
          value={stats?.inboundCalls.toLocaleString() || 0}
          subtitle={`${answerRate}% answer rate`}
          icon={PhoneIncoming}
          color="green"
        />
        <StatCard
          title="Outbound Calls"
          value={stats?.outboundCalls.toLocaleString() || 0}
          icon={PhoneOutgoing}
          color="purple"
        />
        <StatCard
          title="Missed Calls"
          value={stats?.missedCalls.toLocaleString() || 0}
          icon={PhoneMissed}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Avg Talk Time"
          value={formatDuration(stats?.avgTalkDuration || 0)}
          icon={Clock}
          color="blue"
        />
        <StatCard
          title="Avg Ring Time"
          value={formatDuration(stats?.avgRingDuration || 0)}
          icon={Clock}
          color="yellow"
        />
        <StatCard
          title="Total Talk Time"
          value={formatDuration(stats?.totalTalkTime || 0)}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          title="Internal Calls"
          value={stats?.internalCalls.toLocaleString() || 0}
          icon={Users}
          color="purple"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Volume Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Daily Call Volume
          </h3>
          {data?.dailyVolume && data.dailyVolume.length > 0 ? (
            <div className="space-y-2">
              {data.dailyVolume.slice(-14).map((day) => (
                <div key={day.date} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20">
                    {new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <div className="flex-1 flex h-5 rounded overflow-hidden bg-gray-100">
                    <div
                      className="bg-green-500"
                      style={{ width: `${(day.inbound / maxDailyTotal) * 100}%` }}
                      title={`Inbound: ${day.inbound}`}
                    />
                    <div
                      className="bg-purple-500"
                      style={{ width: `${(day.outbound / maxDailyTotal) * 100}%` }}
                      title={`Outbound: ${day.outbound}`}
                    />
                    <div
                      className="bg-blue-400"
                      style={{ width: `${(day.internal / maxDailyTotal) * 100}%` }}
                      title={`Internal: ${day.internal}`}
                    />
                  </div>
                  <span className="text-xs text-gray-600 w-10 text-right">{day.total}</span>
                </div>
              ))}
              <div className="flex items-center gap-4 mt-4 pt-2 border-t border-gray-100">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-green-500" />
                  <span className="text-xs text-gray-500">Inbound</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-purple-500" />
                  <span className="text-xs text-gray-500">Outbound</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-blue-400" />
                  <span className="text-xs text-gray-500">Internal</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No call data for this period</p>
          )}
        </div>

        {/* Hourly Distribution Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Hourly Distribution
          </h3>
          {data?.hourlyDistribution && data.hourlyDistribution.length > 0 ? (
            <div className="space-y-1">
              {data.hourlyDistribution.map((hour) => (
                <div key={hour.hour} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-14">{formatHour(hour.hour)}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(hour.calls / maxHourlyCalls) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-600 w-8 text-right">{hour.calls}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No call data for this period</p>
          )}
        </div>
      </div>

      {/* Extension Stats */}
      {data?.extensionStats && data.extensionStats.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="h-5 w-5" />
            Top Extensions
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-100">
                  <th className="pb-3 font-medium">Extension</th>
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium text-right">Total</th>
                  <th className="pb-3 font-medium text-right">Inbound</th>
                  <th className="pb-3 font-medium text-right">Outbound</th>
                  <th className="pb-3 font-medium text-right">Avg Talk</th>
                </tr>
              </thead>
              <tbody>
                {data.extensionStats.map((ext) => (
                  <tr key={ext.extension} className="border-b border-gray-50">
                    <td className="py-3 font-mono text-sm">{ext.extension}</td>
                    <td className="py-3 text-sm text-gray-600">{ext.name || "-"}</td>
                    <td className="py-3 text-sm text-right font-medium">{ext.totalCalls}</td>
                    <td className="py-3 text-sm text-right text-green-600">{ext.inbound}</td>
                    <td className="py-3 text-sm text-right text-purple-600">{ext.outbound}</td>
                    <td className="py-3 text-sm text-right text-gray-500">{formatDuration(ext.avgTalkDuration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Queue Stats */}
      {data?.queueStats && data.queueStats.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Queue Performance
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-100">
                  <th className="pb-3 font-medium">Queue</th>
                  <th className="pb-3 font-medium text-right">Total</th>
                  <th className="pb-3 font-medium text-right">Answered</th>
                  <th className="pb-3 font-medium text-right">Abandoned</th>
                  <th className="pb-3 font-medium text-right">Avg Wait</th>
                  <th className="pb-3 font-medium text-right">Avg Talk</th>
                  <th className="pb-3 font-medium text-right">Answer Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.queueStats.map((queue) => {
                  const answerRate = queue.totalCalls > 0
                    ? Math.round((queue.answered / queue.totalCalls) * 100)
                    : 0;
                  return (
                    <tr key={queue.queueName} className="border-b border-gray-50">
                      <td className="py-3 text-sm font-medium">{queue.queueName}</td>
                      <td className="py-3 text-sm text-right">{queue.totalCalls}</td>
                      <td className="py-3 text-sm text-right text-green-600">{queue.answered}</td>
                      <td className="py-3 text-sm text-right text-red-600">{queue.abandoned}</td>
                      <td className="py-3 text-sm text-right text-gray-500">{formatDuration(queue.avgWaitTime)}</td>
                      <td className="py-3 text-sm text-right text-gray-500">{formatDuration(queue.avgTalkTime)}</td>
                      <td className="py-3 text-sm text-right">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          answerRate >= 80 ? "bg-green-100 text-green-700" :
                          answerRate >= 60 ? "bg-yellow-100 text-yellow-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {answerRate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
