"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Users, Image, ArrowUpRight } from "lucide-react";

interface Stats {
  total_conversations: number;
  total_messages: number;
  total_media: number;
  total_extensions: number;
}

export function StatsOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/sync/status");
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const statCards = [
    {
      label: "Conversations",
      value: stats?.total_conversations ?? 0,
      icon: MessageSquare,
      gradient: "from-teal-500 to-cyan-600",
      bgGradient: "from-teal-50 to-cyan-50",
      borderColor: "border-teal-200",
      textColor: "text-teal-600",
      shadowColor: "shadow-teal-500/20",
      description: "Total chats",
    },
    {
      label: "Messages",
      value: stats?.total_messages ?? 0,
      icon: MessageSquare,
      gradient: "from-emerald-500 to-green-600",
      bgGradient: "from-emerald-50 to-green-50",
      borderColor: "border-emerald-200",
      textColor: "text-emerald-600",
      shadowColor: "shadow-emerald-500/20",
      description: "Archived messages",
    },
    {
      label: "Media Files",
      value: stats?.total_media ?? 0,
      icon: Image,
      gradient: "from-amber-500 to-orange-600",
      bgGradient: "from-amber-50 to-orange-50",
      borderColor: "border-amber-200",
      textColor: "text-amber-600",
      shadowColor: "shadow-amber-500/20",
      description: "Images & files",
    },
    {
      label: "Extensions",
      value: stats?.total_extensions ?? 0,
      icon: Users,
      gradient: "from-blue-500 to-indigo-600",
      bgGradient: "from-blue-50 to-indigo-50",
      borderColor: "border-blue-200",
      textColor: "text-blue-600",
      shadowColor: "shadow-blue-500/20",
      description: "Active users",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map((card) => (
        <div
          key={card.label}
          className={`relative overflow-hidden bg-gradient-to-br ${card.bgGradient} rounded-2xl p-5 border-2 ${card.borderColor} shadow-lg ${card.shadowColor}`}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/30 rounded-full -mr-12 -mt-12" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 mb-1">{card.label}</p>
              <p className={`text-3xl font-bold text-slate-800`}>
                {isLoading ? (
                  <span className="animate-pulse">...</span>
                ) : (
                  card.value.toLocaleString()
                )}
              </p>
              <div className={`mt-2 flex items-center text-sm ${card.textColor}`}>
                <ArrowUpRight className="h-4 w-4 mr-1" />
                {card.description}
              </div>
            </div>
            <div className={`p-3 bg-gradient-to-br ${card.gradient} rounded-xl shadow-lg ${card.shadowColor}`}>
              <card.icon className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
