import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { format } from "date-fns";

interface ExportMessage {
  id: string;
  sent_at: string;
  sender_name: string | null;
  sender_extension: string | null;
  message_text: string | null;
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
  const searchParams = request.nextUrl.searchParams;
  const conversationId = searchParams.get("conversation_id");
  const formatType = searchParams.get("format") || "json"; // json, csv
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversation_id is required" },
      { status: 400 }
    );
  }

  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant access" }, { status: 403 });
    }

    const supabase = await createClient();

    // Get conversation info - verify tenant ownership
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .select("*, participants(*)")
      .eq("id", conversationId)
      .eq("tenant_id", context.tenantId)
      .single();

    if (convError || !convData) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const conversation = convData as unknown as ExportConversation;

    // Get messages
    const baseQuery = supabase
      .from("messages")
      .select("*, media_files(*)")
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: true });

    const finalQuery = startDate
      ? endDate
        ? baseQuery.gte("sent_at", startDate).lte("sent_at", endDate)
        : baseQuery.gte("sent_at", startDate)
      : endDate
        ? baseQuery.lte("sent_at", endDate)
        : baseQuery;

    const { data, error } = await finalQuery;

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
          `"${(msg.sender_name || "").replace(/"/g, '""')}"`,
          msg.sender_extension || "",
          `"${(msg.message_text || "").replace(/"/g, '""')}"`,
          msg.has_media ? "Yes" : "No",
        ].join(",");
        csvLines.push(line);
      });

      const csv = csvLines.join("\n");

      return new NextResponse(csv, {
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
        message_text: msg.message_text,
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
  } catch (error) {
    console.error("Error in export API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
