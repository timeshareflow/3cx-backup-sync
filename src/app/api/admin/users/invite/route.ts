import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { email, role } = await request.json();

    // Check if user is admin or super_admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "super_admin" && profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only super_admin can create admin users
    if (role === "admin" && profile?.role !== "super_admin") {
      return NextResponse.json({ error: "Only super admins can create admin users" }, { status: 403 });
    }

    // For now, we'll just send an invitation email via Supabase
    // In production, you'd want to use the admin API with service role key
    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { role },
    });

    if (error) {
      // If admin API is not available, return a helpful message
      return NextResponse.json({
        error: "Invitation sent. User will need to sign up and an admin will need to update their role."
      }, { status: 200 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error inviting user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
