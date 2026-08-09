import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const extensionId = searchParams.get("extension_id");
  const before = searchParams.get("before");
  const after = searchParams.get("after");
  const latest = searchParams.get("latest") === "true";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  if (!extensionId) {
    return NextResponse.json({ error: "extension_id is required" }, { status: 400 });
  }

  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant access" }, { status: 403 });
    }

    const supabase = createAdminClient();

    // Verify the extension belongs to this tenant (also gives us its number).
    const { data: extension } = await supabase
      .from("extensions")
      .select("id, extension_number, display_name")
      .eq("id", extensionId)
      .eq("tenant_id", context.tenantId)
      .single();

    if (!extension) {
      return NextResponse.json({ error: "Extension not found" }, { status: 404 });
    }

    // All resolution (conversations for this extension, tenant-scoped, + the
    // message page) happens server-side in one function. Passing thousands of
    // conversation ids back through a PostgREST `.in(...)` builds a URL that
    // exceeds the length limit for busy extensions — which silently returned
    // no messages. The RPC uses `= ANY(array)` internally, so there is no URL
    // blow-up regardless of how many conversations an extension has.
    const { data: result, error } = await supabase.rpc("get_extension_messages", {
      p_ext_id: extension.id,
      p_ext_number: extension.extension_number,
      p_tenant_id: context.tenantId,
      p_before: before || null,
      p_after: after || null,
      p_latest: latest,
      p_limit: limit,
    });

    if (error) {
      console.error("get_extension_messages error:", error);
      return NextResponse.json(
        { error: "Failed to fetch messages", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      result ?? { data: [], conversations: [], total: 0, has_more: false, has_newer: false }
    );
  } catch (error) {
    console.error("Error in messages by extension API:", error);
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
