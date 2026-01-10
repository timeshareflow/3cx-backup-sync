import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { role } = await request.json();

    // Check if user is super_admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if target user is protected
    const { data: targetUser } = await supabase
      .from("user_profiles")
      .select("is_protected, role")
      .eq("id", id)
      .single();

    if (targetUser?.is_protected) {
      return NextResponse.json({ error: "Cannot modify protected user's role" }, { status: 403 });
    }

    // Update user role
    const { error } = await supabase
      .from("user_profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating user role:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
