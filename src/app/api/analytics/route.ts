import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get("period") || "30d";
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");

  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ stats: null, dailyVolume: [], hourlyDistribution: [], extensionStats: [], queueStats: [] });
    }

    const supabase = createAdminClient();

    const dateTo = endDate ? new Date(endDate) : new Date();
    const dateFrom = startDate ? new Date(startDate) : (() => {
      const d = new Date();
      d.setDate(d.getDate() - (period === "7d" ? 7 : period === "90d" ? 90 : 30));
      return d;
    })();

    const from = dateFrom.toISOString();
    const to = dateTo.toISOString();
    const tid = context.tenantId;

    // All aggregation pushed to the DB — no full row fetches
    const [statsRes, dailyRes, hourlyRes, extensionRes, queueRes] = await Promise.all([
      // Overall stats
      supabase.rpc("get_call_stats", { p_tenant_id: tid, p_from: from, p_to: to }),

      // Daily volume grouped by date and direction
      supabase
        .from("call_logs")
        .select("started_at, direction")
        .eq("tenant_id", tid)
        .gte("started_at", from)
        .lte("started_at", to),

      // Hourly distribution
      supabase.rpc("get_hourly_distribution", { p_tenant_id: tid, p_from: from, p_to: to }),

      // Top 20 extensions
      supabase.rpc("get_extension_stats", { p_tenant_id: tid, p_from: from, p_to: to }),

      // Queue stats
      supabase.rpc("get_queue_stats", { p_tenant_id: tid, p_from: from, p_to: to }),
    ]);

    // Build daily volume from lightweight direction+date rows (no heavy columns)
    const dailyMap = new Map<string, { date: string; inbound: number; outbound: number; internal: number; total: number }>();
    for (const row of (dailyRes.data || [])) {
      const date = new Date(row.started_at).toISOString().split("T")[0];
      const entry = dailyMap.get(date) || { date, inbound: 0, outbound: 0, internal: 0, total: 0 };
      entry.total++;
      if (row.direction === "inbound") entry.inbound++;
      else if (row.direction === "outbound") entry.outbound++;
      else entry.internal++;
      dailyMap.set(date, entry);
    }
    const dailyVolume = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      stats: statsRes.data || null,
      dailyVolume,
      hourlyDistribution: hourlyRes.data || [],
      extensionStats: extensionRes.data || [],
      queueStats: queueRes.data || [],
      period: { from, to },
    });
  } catch (error) {
    console.error("Error in analytics API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
