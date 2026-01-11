import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = Math.min(parseInt(searchParams.get("page_size") || "20"), 50);
  const fileType = searchParams.get("file_type"); // image, video, document
  const conversationId = searchParams.get("conversation_id");

  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant access" }, { status: 403 });
    }

    const supabase = await createClient();
    const offset = (page - 1) * pageSize;

    // Build query
    let query = supabase
      .from("media_files")
      .select("*", { count: "exact" })
      .eq("tenant_id", context.tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    // Filter by file type if specified
    if (fileType) {
      if (fileType === "image") {
        query = query.like("mime_type", "image/%");
      } else if (fileType === "video") {
        query = query.like("mime_type", "video/%");
      } else if (fileType === "audio") {
        query = query.like("mime_type", "audio/%");
      } else if (fileType === "document") {
        query = query.not("mime_type", "like", "image/%")
          .not("mime_type", "like", "video/%")
          .not("mime_type", "like", "audio/%");
      }
    }

    // Filter by conversation if specified
    if (conversationId) {
      query = query.eq("conversation_id", conversationId);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Error fetching media files:", error);
      return NextResponse.json(
        { error: "Failed to fetch media files" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      page_size: pageSize,
      has_more: (count || 0) > offset + pageSize,
    });
  } catch (error) {
    console.error("Error in media API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
