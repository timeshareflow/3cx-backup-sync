import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";

export async function GET() {
  try {
    const supabase = await createServerClient();
    const tenantId = await getTenantId();

    if (!tenantId) {
      return NextResponse.json({ error: "No tenant found" }, { status: 400 });
    }

    const { data: extensions, error } = await supabase
      .from("extensions")
      .select("*")
      .eq("tenant_id", tenantId)
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
