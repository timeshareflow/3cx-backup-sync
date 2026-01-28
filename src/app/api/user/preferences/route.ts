import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("user_profiles")
      .select("preferences")
      .eq("id", context.userId)
      .single();

    if (error) {
      console.error("Error fetching preferences:", error);
      return NextResponse.json(
        { error: "Failed to fetch preferences" },
        { status: 500 }
      );
    }

    return NextResponse.json({ preferences: data?.preferences || {} });
  } catch (error) {
    console.error("Error in preferences API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const supabase = createAdminClient();

    // Get existing preferences
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("preferences")
      .eq("id", context.userId)
      .single();

    // Merge new preferences with existing
    const merged = {
      ...(existing?.preferences as Record<string, unknown> || {}),
      ...body,
    };

    const { error } = await supabase
      .from("user_profiles")
      .update({ preferences: merged })
      .eq("id", context.userId);

    if (error) {
      console.error("Error saving preferences:", error);
      return NextResponse.json(
        { error: "Failed to save preferences" },
        { status: 500 }
      );
    }

    return NextResponse.json({ preferences: merged });
  } catch (error) {
    console.error("Error in preferences API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
