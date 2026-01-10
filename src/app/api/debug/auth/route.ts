import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();

    // Get current user from session
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({
        error: "Not authenticated",
        userError: userError?.message,
      });
    }

    // Query profile using regular client (with RLS)
    const { data: profileViaRLS, error: rlsError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    // Query profile using admin client (bypasses RLS)
    const { data: profileViaAdmin, error: adminError } = await adminClient
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    // Check is_super_admin function result via raw SQL
    const { data: superAdminCheck } = await adminClient.rpc("is_super_admin");

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
      },
      profileViaRLS: profileViaRLS || null,
      rlsError: rlsError?.message || null,
      profileViaAdmin: profileViaAdmin || null,
      adminError: adminError?.message || null,
      isSuperAdminFunctionResult: superAdminCheck,
    });
  } catch (error) {
    return NextResponse.json({
      error: "Server error",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
