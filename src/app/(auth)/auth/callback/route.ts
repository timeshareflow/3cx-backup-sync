import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  console.log("Auth callback - code:", code ? "present" : "missing", "next:", next, "full URL:", request.url);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    console.log("Auth callback - code exchange result:", error ? `error: ${error.message}` : "success");

    if (!error) {
      // Get the authenticated user
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Use admin client to bypass RLS and create/update profile
        const adminClient = createAdminClient();

        // Check if this is the first user (make them super_admin)
        const { count } = await adminClient
          .from("user_profiles")
          .select("*", { count: "exact", head: true });

        const isFirstUser = count === 0;

        // Check if user profile exists
        const { data: existingProfile } = await adminClient
          .from("user_profiles")
          .select("id, role")
          .eq("id", user.id)
          .single();

        if (!existingProfile) {
          // Create profile - first user becomes super_admin
          await adminClient.from("user_profiles").insert({
            id: user.id,
            email: user.email!,
            role: isFirstUser ? "super_admin" : "user",
            is_protected: isFirstUser,
            is_active: true,
          });
        }

        // Check if this user needs to change their password
        const needsPasswordChange = user.user_metadata?.password_change_required === true;
        const redirectTo = needsPasswordChange ? "/auth/reset-password" : next;

        console.log("Auth callback - redirecting to:", redirectTo, "needsPasswordChange:", needsPasswordChange);
        return NextResponse.redirect(`${origin}${redirectTo}`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to an error page with instructions
  console.log("Auth callback - failed, redirecting to login");
  return NextResponse.redirect(`${origin}/login?error=Could not authenticate user`);
}
