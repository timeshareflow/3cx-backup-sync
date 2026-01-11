"use client";

import { useState, useEffect } from "react";
import { HardDrive, AlertTriangle, ArrowUpRight, X } from "lucide-react";
import Link from "next/link";

interface StorageData {
  storage: {
    used: number;
    usedFormatted: string;
    limit: number;
    limitFormatted: string;
    percentage: number;
    isUnlimited: boolean;
    warningLevel: "none" | "approaching" | "critical" | "exceeded";
  };
  breakdown: {
    media: { bytes: number; formatted: string };
    recordings: { bytes: number; formatted: string };
    voicemails: { bytes: number; formatted: string };
    faxes: { bytes: number; formatted: string };
    meetings: { bytes: number; formatted: string };
  };
  counts: {
    messages: number;
  };
  plan: {
    id: string;
    name: string;
    storageLimitGb: number;
    priceMonthly: string;
  } | null;
}

interface StorageMonitorProps {
  variant?: "full" | "compact" | "banner";
  showUpgradePrompt?: boolean;
  onDismiss?: () => void;
}

export function StorageMonitor({
  variant = "full",
  showUpgradePrompt = true,
  onDismiss,
}: StorageMonitorProps) {
  const [data, setData] = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetchStorageData();
  }, []);

  const fetchStorageData = async () => {
    try {
      const response = await fetch("/api/storage/usage");
      if (response.ok) {
        const storageData = await response.json();
        setData(storageData);
      }
    } catch (error) {
      console.error("Failed to fetch storage data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`animate-pulse ${variant === "banner" ? "h-12" : "h-32"} bg-gray-100 rounded-xl`} />
    );
  }

  if (!data) {
    return null;
  }

  const { storage } = data;

  // Determine colors based on warning level
  const getColors = () => {
    switch (storage.warningLevel) {
      case "exceeded":
        return {
          bg: "bg-red-50",
          border: "border-red-200",
          text: "text-red-700",
          progress: "bg-red-500",
          icon: "text-red-500",
        };
      case "critical":
        return {
          bg: "bg-amber-50",
          border: "border-amber-200",
          text: "text-amber-700",
          progress: "bg-amber-500",
          icon: "text-amber-500",
        };
      case "approaching":
        return {
          bg: "bg-yellow-50",
          border: "border-yellow-200",
          text: "text-yellow-700",
          progress: "bg-yellow-500",
          icon: "text-yellow-500",
        };
      default:
        return {
          bg: "bg-gray-50",
          border: "border-gray-200",
          text: "text-gray-700",
          progress: "bg-teal-500",
          icon: "text-teal-500",
        };
    }
  };

  const colors = getColors();

  // Banner variant - shown when storage is at 75%+
  if (variant === "banner") {
    if (storage.isUnlimited || storage.warningLevel === "none" || dismissed) {
      return null;
    }

    return (
      <div className={`${colors.bg} ${colors.border} border rounded-lg p-3 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <AlertTriangle className={`h-5 w-5 ${colors.icon}`} />
          <span className={colors.text}>
            {storage.warningLevel === "exceeded" && (
              <strong>Storage limit exceeded!</strong>
            )}
            {storage.warningLevel === "critical" && (
              <span>Storage at {storage.percentage}% - upgrade soon</span>
            )}
            {storage.warningLevel === "approaching" && (
              <span>Storage reaching limit ({storage.percentage}% used)</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {showUpgradePrompt && (
            <Link
              href="/admin/billing"
              className={`flex items-center gap-1 text-sm font-medium ${colors.text} hover:underline`}
            >
              Upgrade <ArrowUpRight className="h-3 w-3" />
            </Link>
          )}
          {onDismiss && (
            <button
              onClick={() => {
                setDismissed(true);
                onDismiss();
              }}
              className="p-1 hover:bg-black/5 rounded"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Compact variant - for sidebar or small widgets
  if (variant === "compact") {
    return (
      <div className="p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <HardDrive className={`h-4 w-4 ${colors.icon}`} />
            <span className="text-sm font-medium">Storage</span>
          </div>
          <span className="text-sm text-gray-500">
            {storage.isUnlimited ? storage.usedFormatted : `${storage.percentage}%`}
          </span>
        </div>
        {!storage.isUnlimited && (
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${colors.progress} transition-all`}
              style={{ width: `${Math.min(storage.percentage, 100)}%` }}
            />
          </div>
        )}
        <div className="flex justify-between items-center mt-1 text-xs text-gray-500">
          <span>{storage.usedFormatted}</span>
          <span>{storage.limitFormatted}</span>
        </div>
      </div>
    );
  }

  // Full variant - detailed storage breakdown
  return (
    <div className={`${colors.bg} ${colors.border} border rounded-2xl p-6`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 ${storage.warningLevel !== "none" ? colors.bg : "bg-teal-100"} rounded-lg`}>
            <HardDrive className={`h-6 w-6 ${colors.icon}`} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Storage Usage</h3>
            <p className="text-sm text-gray-500">
              {data.plan?.name || "No plan"} - {storage.limitFormatted}
            </p>
          </div>
        </div>
        {storage.warningLevel !== "none" && showUpgradePrompt && (
          <Link
            href="/admin/billing"
            className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-medium rounded-lg hover:from-teal-600 hover:to-cyan-700 transition-colors"
          >
            Upgrade <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-2xl font-bold text-gray-900">{storage.usedFormatted}</span>
          <span className={`text-sm font-medium ${colors.text}`}>
            {storage.isUnlimited ? "Unlimited" : `${storage.percentage}% used`}
          </span>
        </div>
        {!storage.isUnlimited && (
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${colors.progress} transition-all duration-500`}
              style={{ width: `${Math.min(storage.percentage, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Warning message */}
      {storage.warningLevel !== "none" && (
        <div className={`p-3 ${colors.bg} rounded-lg mb-4 flex items-start gap-2`}>
          <AlertTriangle className={`h-5 w-5 ${colors.icon} mt-0.5`} />
          <div>
            {storage.warningLevel === "exceeded" && (
              <p className={colors.text}>
                <strong>Storage limit exceeded.</strong> Some sync operations may be paused.
                Please upgrade your plan to continue.
              </p>
            )}
            {storage.warningLevel === "critical" && (
              <p className={colors.text}>
                <strong>Storage almost full ({storage.percentage}%).</strong> Consider upgrading
                your plan to avoid interruptions.
              </p>
            )}
            {storage.warningLevel === "approaching" && (
              <p className={colors.text}>
                Storage is at {storage.percentage}% of your plan limit. Consider upgrading soon.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(data.breakdown).map(([key, value]) => (
          <div key={key} className="bg-white p-3 rounded-lg">
            <p className="text-xs text-gray-500 capitalize mb-1">{key}</p>
            <p className="font-medium text-gray-900">{value.formatted}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center text-sm text-gray-500">
        <span>{data.counts.messages.toLocaleString()} messages archived</span>
        <span>Updated just now</span>
      </div>
    </div>
  );
}
