import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { format } from "date-fns";
import { withRateLimit } from "@/lib/api-utils";
import { rateLimitConfigs } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface ExportMessage {
  id: string;
  sent_at: string;
  sender_name: string | null;
  sender_extension: string | null;
  message_text: string | null;
  content: string | null;
  message_type: string;
  has_media: boolean;
  media_files: unknown[];
}

interface ExportConversation {
  id: string;
  conversation_name: string | null;
  message_count: number;
  first_message_at: string | null;
  last_message_at: string | null;
  participants: unknown[];
}

export async function GET(request: NextRequest) {
  // Rate limit: 5 exports per minute to prevent abuse (exports are resource-intensive)
  const rateLimited = withRateLimit(request, rateLimitConfigs.export);
  if (rateLimited) return rateLimited;

  const searchParams = request.nextUrl.searchParams;
  const exportType = searchParams.get("type") || "conversation"; // conversation, messages, recordings, voicemails, faxes, call_logs, all
  const conversationId = searchParams.get("conversation_id");
  const formatType = searchParams.get("format") || "json"; // json, csv
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");

  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant access" }, { status: 403 });
    }

    const supabase = await createClient();

    // Handle different export types
    switch (exportType) {
      case "conversation": {
        if (!conversationId) {
          return NextResponse.json(
            { error: "conversation_id is required for conversation export" },
            { status: 400 }
          );
        }
        return exportConversation(supabase, context.tenantId, conversationId, formatType, startDate, endDate);
      }

      case "messages": {
        return exportAllMessages(supabase, context.tenantId, formatType, startDate, endDate);
      }

      case "recordings": {
        return exportRecordings(supabase, context.tenantId, formatType, startDate, endDate);
      }

      case "voicemails": {
        return exportVoicemails(supabase, context.tenantId, formatType, startDate, endDate);
      }

      case "faxes": {
        return exportFaxes(supabase, context.tenantId, formatType, startDate, endDate);
      }

      case "call_logs": {
        return exportCallLogs(supabase, context.tenantId, formatType, startDate, endDate);
      }

      case "all": {
        return exportAll(supabase, context.tenantId, startDate, endDate);
      }

      default:
        return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error in export API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function exportConversation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  conversationId: string,
  formatType: string,
  startDate: string | null,
  endDate: string | null
) {
  // Get conversation info - verify tenant ownership
  const { data: convData, error: convError } = await supabase
    .from("conversations")
    .select("*, participants(*)")
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .single();

  if (convError || !convData) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const conversation = convData as unknown as ExportConversation;

  // Get messages
  let query = supabase
    .from("messages")
    .select("*, media_files(*)")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });

  if (startDate) {
    query = query.gte("sent_at", startDate);
  }
  if (endDate) {
    query = query.lte("sent_at", endDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching messages for export:", error);
    return NextResponse.json(
      { error: "Failed to export conversation" },
      { status: 500 }
    );
  }

  const messages = (data || []) as unknown as ExportMessage[];

  // Format based on requested type
  if (formatType === "csv") {
    const csvLines = [
      ["Timestamp", "Sender", "Extension", "Message", "Has Media"].join(","),
    ];

    messages.forEach((msg) => {
      const line = [
        format(new Date(msg.sent_at), "yyyy-MM-dd HH:mm:ss"),
        escapeCSV(msg.sender_name || ""),
        msg.sender_extension || "",
        escapeCSV(msg.message_text || msg.content || ""),
        msg.has_media ? "Yes" : "No",
      ].join(",");
      csvLines.push(line);
    });

    return new NextResponse(csvLines.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="conversation-${conversationId}.csv"`,
      },
    });
  }

  // Default: JSON format
  const exportData = {
    conversation: {
      id: conversation.id,
      name: conversation.conversation_name,
      participants: conversation.participants,
      message_count: conversation.message_count,
      first_message_at: conversation.first_message_at,
      last_message_at: conversation.last_message_at,
    },
    messages: messages.map((msg) => ({
      id: msg.id,
      sent_at: msg.sent_at,
      sender_name: msg.sender_name,
      sender_extension: msg.sender_extension,
      message_text: msg.message_text || msg.content,
      message_type: msg.message_type,
      has_media: msg.has_media,
      media_files: msg.media_files,
    })),
    exported_at: new Date().toISOString(),
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="conversation-${conversationId}.json"`,
    },
  });
}

async function exportAllMessages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  formatType: string,
  startDate: string | null,
  endDate: string | null
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
        tenant_id
      )
    `)
    .eq("conversations.tenant_id", tenantId)
    .order("sent_at", { ascending: false })
    .limit(50000);

  if (startDate) {
    query = query.gte("sent_at", `${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    query = query.lte("sent_at", `${endDate}T23:59:59.999Z`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error exporting messages:", error);
    return NextResponse.json({ error: "Failed to export messages" }, { status: 500 });
  }

  const messages = (data || []).map((m: Record<string, unknown>) => ({
    id: m.id,
    content: m.content,
    sender_name: m.sender_name,
    sender_identifier: m.sender_identifier,
    sent_at: m.sent_at,
    has_media: m.has_media,
    conversation_name: (m.conversations as Record<string, unknown>)?.conversation_name,
  }));

  const filename = `messages_export_${new Date().toISOString().split("T")[0]}`;

  if (formatType === "csv") {
    return new NextResponse(convertToCSV(messages), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  return new NextResponse(JSON.stringify(messages, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}.json"`,
    },
  });
}

async function exportRecordings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  formatType: string,
  startDate: string | null,
  endDate: string | null
) {
  let query = supabase
    .from("call_recordings")
    .select("id, original_filename, extension, file_size, duration, recorded_at, created_at")
    .eq("tenant_id", tenantId)
    .order("recorded_at", { ascending: false });

  if (startDate) {
    query = query.gte("recorded_at", `${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    query = query.lte("recorded_at", `${endDate}T23:59:59.999Z`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error exporting recordings:", error);
    return NextResponse.json({ error: "Failed to export recordings" }, { status: 500 });
  }

  const filename = `recordings_export_${new Date().toISOString().split("T")[0]}`;

  if (formatType === "csv") {
    return new NextResponse(convertToCSV(data || []), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  return new NextResponse(JSON.stringify(data || [], null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}.json"`,
    },
  });
}

async function exportVoicemails(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  formatType: string,
  startDate: string | null,
  endDate: string | null
) {
  let query = supabase
    .from("voicemails")
    .select("id, extension, caller_number, caller_name, duration, is_urgent, received_at, created_at")
    .eq("tenant_id", tenantId)
    .order("received_at", { ascending: false });

  if (startDate) {
    query = query.gte("received_at", `${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    query = query.lte("received_at", `${endDate}T23:59:59.999Z`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error exporting voicemails:", error);
    return NextResponse.json({ error: "Failed to export voicemails" }, { status: 500 });
  }

  const filename = `voicemails_export_${new Date().toISOString().split("T")[0]}`;

  if (formatType === "csv") {
    return new NextResponse(convertToCSV(data || []), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  return new NextResponse(JSON.stringify(data || [], null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}.json"`,
    },
  });
}

async function exportFaxes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  formatType: string,
  startDate: string | null,
  endDate: string | null
) {
  let query = supabase
    .from("faxes")
    .select("id, direction, remote_number, extension_number, page_count, status, sent_received_at, created_at")
    .eq("tenant_id", tenantId)
    .order("sent_received_at", { ascending: false });

  if (startDate) {
    query = query.gte("sent_received_at", `${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    query = query.lte("sent_received_at", `${endDate}T23:59:59.999Z`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error exporting faxes:", error);
    return NextResponse.json({ error: "Failed to export faxes" }, { status: 500 });
  }

  const filename = `faxes_export_${new Date().toISOString().split("T")[0]}`;

  if (formatType === "csv") {
    return new NextResponse(convertToCSV(data || []), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  return new NextResponse(JSON.stringify(data || [], null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}.json"`,
    },
  });
}

async function exportCallLogs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  formatType: string,
  startDate: string | null,
  endDate: string | null
) {
  let query = supabase
    .from("call_logs")
    .select("id, direction, caller_number, caller_name, callee_number, callee_name, extension_number, ring_duration, talk_duration, total_duration, status, started_at, answered_at, ended_at")
    .eq("tenant_id", tenantId)
    .order("started_at", { ascending: false });

  if (startDate) {
    query = query.gte("started_at", `${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    query = query.lte("started_at", `${endDate}T23:59:59.999Z`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error exporting call logs:", error);
    return NextResponse.json({ error: "Failed to export call logs" }, { status: 500 });
  }

  const filename = `call_logs_export_${new Date().toISOString().split("T")[0]}`;

  if (formatType === "csv") {
    return new NextResponse(convertToCSV(data || []), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  return new NextResponse(JSON.stringify(data || [], null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}.json"`,
    },
  });
}

async function exportAll(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  startDate: string | null,
  endDate: string | null
) {
  // Fetch all data types
  const [conversations, messages, recordings, voicemails, faxes, callLogs] = await Promise.all([
    supabase
      .from("conversations")
      .select("*, participants(*)")
      .eq("tenant_id", tenantId)
      .order("last_message_at", { ascending: false }),
    supabase
      .from("messages")
      .select("id, content, sender_name, sender_identifier, sent_at, has_media, conversation_id")
      .eq("tenant_id", tenantId)
      .order("sent_at", { ascending: false })
      .limit(100000),
    supabase
      .from("call_recordings")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("recorded_at", { ascending: false }),
    supabase
      .from("voicemails")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("received_at", { ascending: false }),
    supabase
      .from("faxes")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("sent_received_at", { ascending: false }),
    supabase
      .from("call_logs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false }),
  ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    date_range: {
      start: startDate,
      end: endDate,
    },
    conversations: conversations.data || [],
    messages: messages.data || [],
    call_recordings: recordings.data || [],
    voicemails: voicemails.data || [],
    faxes: faxes.data || [],
    call_logs: callLogs.data || [],
    summary: {
      conversations: (conversations.data || []).length,
      messages: (messages.data || []).length,
      call_recordings: (recordings.data || []).length,
      voicemails: (voicemails.data || []).length,
      faxes: (faxes.data || []).length,
      call_logs: (callLogs.data || []).length,
    },
  };

  const filename = `full_backup_${new Date().toISOString().split("T")[0]}`;

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}.json"`,
    },
  });
}

function convertToCSV(data: unknown[]): string {
  if (data.length === 0) return "";

  const records = data as Record<string, unknown>[];
  const headers = [...new Set(records.flatMap(Object.keys))];
  const csvRows = [headers.map(escapeCSV).join(",")];

  for (const record of records) {
    const values = headers.map((header) => {
      const value = record[header];
      if (value === null || value === undefined) return "";
      if (typeof value === "object") return escapeCSV(JSON.stringify(value));
      return escapeCSV(String(value));
    });
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
