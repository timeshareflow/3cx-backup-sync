import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { withRateLimit } from "@/lib/api-utils";
import { rateLimitConfigs } from "@/lib/rate-limit";

type ReportType = "call_logs" | "recordings" | "voicemails" | "faxes" | "messages" | "meetings";

interface ReportStats {
  total: number;
  [key: string]: number | string;
}

export async function GET(request: NextRequest) {
  const rateLimited = withRateLimit(request, rateLimitConfigs.export);
  if (rateLimited) return rateLimited;

  const searchParams = request.nextUrl.searchParams;
  const reportType = (searchParams.get("type") || "call_logs") as ReportType;
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");
  const direction = searchParams.get("direction");
  const status = searchParams.get("status");
  const extension = searchParams.get("extension");
  const includeStats = searchParams.get("include_stats") === "true";
  const limit = Math.min(parseInt(searchParams.get("limit") || "500"), 5000);

  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant access" }, { status: 403 });
    }

    const supabase = createAdminClient();

    // Check user role for permission bypass
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", context.userId)
      .single();

    const isSuperAdmin = profile?.role === "super_admin";
    const isAdmin = profile?.role === "admin";

    // Check tenant admin status
    let isTenantAdmin = false;
    if (!isSuperAdmin && !isAdmin) {
      const { data: tenantRole } = await supabase
        .from("user_tenants")
        .select("role")
        .eq("user_id", context.userId)
        .eq("tenant_id", context.tenantId)
        .single();
      isTenantAdmin = tenantRole?.role === "admin";
    }

    const bypassFiltering = isSuperAdmin || isAdmin || isTenantAdmin;

    // Get report data based on type
    const reportResult = await getReportData(
      supabase,
      reportType,
      context.tenantId,
      {
        startDate,
        endDate,
        direction,
        status,
        extension,
        limit,
        bypassFiltering,
        userId: context.userId,
      }
    );

    // Calculate stats if requested
    let stats: ReportStats | null = null;
    if (includeStats && reportResult.data) {
      stats = calculateStats(reportType, reportResult.data);
    }

    return NextResponse.json({
      data: reportResult.data || [],
      total: reportResult.total || 0,
      stats,
      report_type: reportType,
      date_range: { start: startDate, end: endDate },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[reports API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}

interface ReportFilters {
  startDate: string | null;
  endDate: string | null;
  direction: string | null;
  status: string | null;
  extension: string | null;
  limit: number;
  bypassFiltering: boolean;
  userId: string;
}

async function getReportData(
  supabase: ReturnType<typeof createAdminClient>,
  reportType: ReportType,
  tenantId: string,
  filters: ReportFilters
) {
  const { startDate, endDate, direction, status, extension, limit } = filters;

  switch (reportType) {
    case "call_logs":
      return getCallLogsReport(supabase, tenantId, { startDate, endDate, direction, status, extension, limit });
    case "recordings":
      return getRecordingsReport(supabase, tenantId, { startDate, endDate, direction, extension, limit });
    case "voicemails":
      return getVoicemailsReport(supabase, tenantId, { startDate, endDate, extension, limit });
    case "faxes":
      return getFaxesReport(supabase, tenantId, { startDate, endDate, direction, extension, limit });
    case "messages":
      return getMessagesReport(supabase, tenantId, { startDate, endDate, limit });
    case "meetings":
      return getMeetingsReport(supabase, tenantId, { startDate, endDate, extension, limit });
    default:
      return { data: [], total: 0 };
  }
}

async function getCallLogsReport(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  filters: { startDate: string | null; endDate: string | null; direction: string | null; status: string | null; extension: string | null; limit: number }
) {
  let query = supabase
    .from("call_logs")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("started_at", { ascending: false })
    .limit(filters.limit);

  if (filters.startDate) {
    query = query.gte("started_at", `${filters.startDate}T00:00:00.000Z`);
  }
  if (filters.endDate) {
    query = query.lte("started_at", `${filters.endDate}T23:59:59.999Z`);
  }
  if (filters.direction) {
    query = query.eq("direction", filters.direction);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.extension) {
    query = query.or(`caller_number.eq.${filters.extension},callee_number.eq.${filters.extension}`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, total: count || 0 };
}

async function getRecordingsReport(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  filters: { startDate: string | null; endDate: string | null; direction: string | null; extension: string | null; limit: number }
) {
  let query = supabase
    .from("call_recordings")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("started_at", { ascending: false })
    .limit(filters.limit);

  if (filters.startDate) {
    query = query.gte("started_at", `${filters.startDate}T00:00:00.000Z`);
  }
  if (filters.endDate) {
    query = query.lte("started_at", `${filters.endDate}T23:59:59.999Z`);
  }
  if (filters.direction) {
    query = query.eq("direction", filters.direction);
  }
  if (filters.extension) {
    query = query.or(`caller_number.eq.${filters.extension},callee_number.eq.${filters.extension}`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, total: count || 0 };
}

async function getVoicemailsReport(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  filters: { startDate: string | null; endDate: string | null; extension: string | null; limit: number }
) {
  let query = supabase
    .from("voicemails")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("received_at", { ascending: false })
    .limit(filters.limit);

  if (filters.startDate) {
    query = query.gte("received_at", `${filters.startDate}T00:00:00.000Z`);
  }
  if (filters.endDate) {
    query = query.lte("received_at", `${filters.endDate}T23:59:59.999Z`);
  }
  if (filters.extension) {
    query = query.eq("extension_number", filters.extension);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, total: count || 0 };
}

async function getFaxesReport(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  filters: { startDate: string | null; endDate: string | null; direction: string | null; extension: string | null; limit: number }
) {
  let query = supabase
    .from("faxes")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("sent_received_at", { ascending: false })
    .limit(filters.limit);

  if (filters.startDate) {
    query = query.gte("sent_received_at", `${filters.startDate}T00:00:00.000Z`);
  }
  if (filters.endDate) {
    query = query.lte("sent_received_at", `${filters.endDate}T23:59:59.999Z`);
  }
  if (filters.direction) {
    query = query.eq("direction", filters.direction);
  }
  if (filters.extension) {
    query = query.eq("extension_number", filters.extension);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, total: count || 0 };
}

async function getMessagesReport(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  filters: { startDate: string | null; endDate: string | null; limit: number }
) {
  let query = supabase
    .from("messages")
    .select(`
      id,
      content,
      sender_name,
      sender_identifier,
      sent_at,
      has_media,
      conversations!inner (
        id,
        conversation_name,
        channel_type,
        tenant_id
      )
    `, { count: "exact" })
    .eq("conversations.tenant_id", tenantId)
    .order("sent_at", { ascending: false })
    .limit(filters.limit);

  if (filters.startDate) {
    query = query.gte("sent_at", `${filters.startDate}T00:00:00.000Z`);
  }
  if (filters.endDate) {
    query = query.lte("sent_at", `${filters.endDate}T23:59:59.999Z`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  // Transform data to flatten conversation info
  const flatData = (data || []).map((msg: Record<string, unknown>) => ({
    id: msg.id,
    content: msg.content,
    sender_name: msg.sender_name,
    sender_identifier: msg.sender_identifier,
    sent_at: msg.sent_at,
    has_media: msg.has_media,
    conversation_name: (msg.conversations as Record<string, unknown>)?.conversation_name,
    channel_type: (msg.conversations as Record<string, unknown>)?.channel_type,
  }));

  return { data: flatData, total: count || 0 };
}

async function getMeetingsReport(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  filters: { startDate: string | null; endDate: string | null; extension: string | null; limit: number }
) {
  let query = supabase
    .from("meeting_recordings")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("uploaded_at", { ascending: false })
    .limit(filters.limit);

  if (filters.startDate) {
    query = query.gte("meeting_started_at", `${filters.startDate}T00:00:00.000Z`);
  }
  if (filters.endDate) {
    query = query.lte("meeting_started_at", `${filters.endDate}T23:59:59.999Z`);
  }
  if (filters.extension) {
    query = query.eq("host_extension", filters.extension);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, total: count || 0 };
}

function calculateStats(reportType: ReportType, data: unknown[]): ReportStats {
  const records = data as Record<string, unknown>[];

  switch (reportType) {
    case "call_logs": {
      const inbound = records.filter(r => r.direction === "inbound").length;
      const outbound = records.filter(r => r.direction === "outbound").length;
      const internal = records.filter(r => r.direction === "internal").length;
      const answered = records.filter(r => r.status === "answered").length;
      const missed = records.filter(r => r.status === "missed" || r.status === "no_answer").length;
      const busy = records.filter(r => r.status === "busy").length;
      const totalDuration = records.reduce((sum, r) => sum + (Number(r.duration_seconds) || 0), 0);
      const avgDuration = records.length > 0 ? Math.round(totalDuration / records.length) : 0;
      const withRecording = records.filter(r => r.recording_id).length;

      return {
        total: records.length,
        inbound,
        outbound,
        internal,
        answered,
        missed,
        busy,
        total_duration: totalDuration,
        avg_duration: avgDuration,
        with_recording: withRecording,
      };
    }

    case "recordings": {
      const inbound = records.filter(r => r.direction === "inbound").length;
      const outbound = records.filter(r => r.direction === "outbound").length;
      const totalDuration = records.reduce((sum, r) => sum + (Number(r.duration_seconds) || 0), 0);
      const avgDuration = records.length > 0 ? Math.round(totalDuration / records.length) : 0;
      const totalSize = records.reduce((sum, r) => sum + (Number(r.file_size) || 0), 0);

      return {
        total: records.length,
        inbound,
        outbound,
        total_duration: totalDuration,
        avg_duration: avgDuration,
        total_size: totalSize,
      };
    }

    case "voicemails": {
      const read = records.filter(r => r.is_read).length;
      const unread = records.filter(r => !r.is_read).length;
      const urgent = records.filter(r => r.is_urgent).length;
      const totalDuration = records.reduce((sum, r) => sum + (Number(r.duration_seconds) || 0), 0);
      const avgDuration = records.length > 0 ? Math.round(totalDuration / records.length) : 0;

      return {
        total: records.length,
        read,
        unread,
        urgent,
        total_duration: totalDuration,
        avg_duration: avgDuration,
      };
    }

    case "faxes": {
      const sent = records.filter(r => r.direction === "outbound" || r.direction === "sent").length;
      const received = records.filter(r => r.direction === "inbound" || r.direction === "received").length;
      const totalPages = records.reduce((sum, r) => sum + (Number(r.page_count) || 0), 0);
      const success = records.filter(r => r.status === "completed" || r.status === "sent" || r.status === "received").length;
      const failed = records.filter(r => r.status === "failed").length;

      return {
        total: records.length,
        sent,
        received,
        total_pages: totalPages,
        success,
        failed,
      };
    }

    case "messages": {
      const withMedia = records.filter(r => r.has_media).length;
      const uniqueSenders = new Set(records.map(r => r.sender_identifier).filter(Boolean)).size;
      const uniqueConversations = new Set(records.map(r => r.conversation_name).filter(Boolean)).size;

      return {
        total: records.length,
        with_media: withMedia,
        unique_senders: uniqueSenders,
        unique_conversations: uniqueConversations,
      };
    }

    case "meetings": {
      const totalDuration = records.reduce((sum, r) => sum + (Number(r.duration_seconds) || 0), 0);
      const avgDuration = records.length > 0 ? Math.round(totalDuration / records.length) : 0;
      const totalParticipants = records.reduce((sum, r) => sum + (Number(r.participant_count) || 0), 0);
      const avgParticipants = records.length > 0 ? Math.round(totalParticipants / records.length) : 0;
      const withVideo = records.filter(r => r.has_video).length;

      return {
        total: records.length,
        total_duration: totalDuration,
        avg_duration: avgDuration,
        avg_participants: avgParticipants,
        with_video: withVideo,
      };
    }

    default:
      return { total: records.length };
  }
}
