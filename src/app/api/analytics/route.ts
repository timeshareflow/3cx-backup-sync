import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get("period") || "30d"; // 7d, 30d, 90d, custom
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");

  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({
        stats: null,
        dailyVolume: [],
        hourlyDistribution: [],
        extensionStats: [],
        queueStats: [],
      });
    }

    // Use admin client to bypass RLS after validating user access
    const supabase = createAdminClient();

    // Calculate date range
    let dateFrom: Date;
    const dateTo = endDate ? new Date(endDate) : new Date();

    if (startDate) {
      dateFrom = new Date(startDate);
    } else {
      dateFrom = new Date();
      switch (period) {
        case "7d":
          dateFrom.setDate(dateFrom.getDate() - 7);
          break;
        case "90d":
          dateFrom.setDate(dateFrom.getDate() - 90);
          break;
        case "30d":
        default:
          dateFrom.setDate(dateFrom.getDate() - 30);
      }
    }

    // Get all call logs for the period
    const { data: callLogs, error } = await supabase
      .from("call_logs")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .gte("started_at", dateFrom.toISOString())
      .lte("started_at", dateTo.toISOString())
      .order("started_at", { ascending: true });

    if (error) {
      console.error("Error fetching call logs:", error);
      return NextResponse.json(
        { error: "Failed to fetch analytics data" },
        { status: 500 }
      );
    }

    const logs = callLogs || [];

    // Calculate overall stats
    const stats: CallStats = {
      totalCalls: logs.length,
      inboundCalls: logs.filter((l) => l.direction === "inbound").length,
      outboundCalls: logs.filter((l) => l.direction === "outbound").length,
      internalCalls: logs.filter((l) => l.direction === "internal").length,
      answeredCalls: logs.filter((l) => l.answered_at !== null).length,
      missedCalls: logs.filter((l) => l.answered_at === null && l.direction === "inbound").length,
      avgTalkDuration: logs.length > 0
        ? Math.round(logs.reduce((sum, l) => sum + (l.talk_duration || 0), 0) / logs.length)
        : 0,
      avgRingDuration: logs.length > 0
        ? Math.round(logs.reduce((sum, l) => sum + (l.ring_duration || 0), 0) / logs.length)
        : 0,
      totalTalkTime: logs.reduce((sum, l) => sum + (l.talk_duration || 0), 0),
    };

    // Calculate daily volume
    const dailyMap = new Map<string, DailyCallVolume>();
    for (const log of logs) {
      const date = new Date(log.started_at).toISOString().split("T")[0];
      const existing = dailyMap.get(date) || { date, inbound: 0, outbound: 0, internal: 0, total: 0 };
      existing.total++;
      if (log.direction === "inbound") existing.inbound++;
      else if (log.direction === "outbound") existing.outbound++;
      else existing.internal++;
      dailyMap.set(date, existing);
    }
    const dailyVolume = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Calculate hourly distribution
    const hourlyMap = new Map<number, number>();
    for (let i = 0; i < 24; i++) hourlyMap.set(i, 0);
    for (const log of logs) {
      const hour = new Date(log.started_at).getHours();
      hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
    }
    const hourlyDistribution: HourlyDistribution[] = Array.from(hourlyMap.entries())
      .map(([hour, calls]) => ({ hour, calls }))
      .sort((a, b) => a.hour - b.hour);

    // Calculate extension stats
    const extMap = new Map<string, ExtensionStats>();
    for (const log of logs) {
      if (!log.extension_number) continue;
      const ext = log.extension_number;
      const existing = extMap.get(ext) || {
        extension: ext,
        name: log.caller_name || log.callee_name || null,
        totalCalls: 0,
        inbound: 0,
        outbound: 0,
        avgTalkDuration: 0,
      };
      existing.totalCalls++;
      if (log.direction === "inbound") existing.inbound++;
      else if (log.direction === "outbound") existing.outbound++;
      existing.avgTalkDuration += log.talk_duration || 0;
      extMap.set(ext, existing);
    }
    const extensionStats = Array.from(extMap.values())
      .map((ext) => ({
        ...ext,
        avgTalkDuration: ext.totalCalls > 0 ? Math.round(ext.avgTalkDuration / ext.totalCalls) : 0,
      }))
      .sort((a, b) => b.totalCalls - a.totalCalls)
      .slice(0, 20);

    // Calculate queue stats
    const queueMap = new Map<string, QueueStats>();
    for (const log of logs) {
      if (!log.queue_name) continue;
      const queue = log.queue_name;
      const existing = queueMap.get(queue) || {
        queueName: queue,
        totalCalls: 0,
        answered: 0,
        abandoned: 0,
        avgWaitTime: 0,
        avgTalkTime: 0,
      };
      existing.totalCalls++;
      if (log.answered_at) {
        existing.answered++;
        existing.avgTalkTime += log.talk_duration || 0;
      } else {
        existing.abandoned++;
      }
      existing.avgWaitTime += log.ring_duration || 0;
      queueMap.set(queue, existing);
    }
    const queueStats = Array.from(queueMap.values())
      .map((q) => ({
        ...q,
        avgWaitTime: q.totalCalls > 0 ? Math.round(q.avgWaitTime / q.totalCalls) : 0,
        avgTalkTime: q.answered > 0 ? Math.round(q.avgTalkTime / q.answered) : 0,
      }))
      .sort((a, b) => b.totalCalls - a.totalCalls);

    return NextResponse.json({
      stats,
      dailyVolume,
      hourlyDistribution,
      extensionStats,
      queueStats,
      period: {
        from: dateFrom.toISOString(),
        to: dateTo.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error in analytics API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
