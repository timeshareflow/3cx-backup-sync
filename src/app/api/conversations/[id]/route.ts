import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant access" }, { status: 403 });
    }

    const supabase = await createClient();

    // Get conversation with participants, filtered by tenant
    const { data: conversation, error } = await supabase
      .from("conversations")
      .select(
        `
        *,
        participants (*)
      `
      )
      .eq("id", id)
      .eq("tenant_id", context.tenantId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }
      console.error("Error fetching conversation:", error);
      return NextResponse.json(
        { error: "Failed to fetch conversation" },
        { status: 500 }
      );
    }

    return NextResponse.json(conversation);
  } catch (error) {
    console.error("Error in conversation API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
