import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant found" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: extensions, error } = await supabase
      .from("extensions")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .order("extension_number", { ascending: true });

    if (error) {
      console.error("Failed to fetch extensions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(extensions || []);
  } catch (error) {
    console.error("Extensions API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch extensions" },
      { status: 500 }
    );
  }
}
