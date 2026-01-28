import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("impersonationSessionId")?.value;

    if (!sessionId) {
      return NextResponse.json({
        isImpersonating: false,
        session: null,
      });
    }

    // Get current user
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Get the active session with user details
    const { data: session, error: sessionError } = await supabase
      .from("impersonation_sessions")
      .select(`
        id,
        reason,
        started_at,
        impersonated_user:user_profiles!impersonation_sessions_impersonated_user_id_fkey(
          id,
          email,
          full_name
        ),
        tenant:tenants!impersonation_sessions_tenant_id_fkey(
          id,
          name,
          slug
        )
      `)
      .eq("id", sessionId)
      .eq("super_admin_id", user.id)
      .is("ended_at", null)
      .single();

    if (sessionError || !session) {
      // Session expired or invalid, clear cookies
      cookieStore.delete("impersonationSessionId");
      cookieStore.delete("impersonatedUserId");

      return NextResponse.json({
        isImpersonating: false,
        session: null,
      });
    }

    // Check if session has expired (1 hour max)
    const sessionAge = Date.now() - new Date(session.started_at).getTime();
    const maxAge = 60 * 60 * 1000; // 1 hour in milliseconds

    if (sessionAge > maxAge) {
      // Auto-end expired session
      await supabase
        .from("impersonation_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sessionId);

      cookieStore.delete("impersonationSessionId");
      cookieStore.delete("impersonatedUserId");

      return NextResponse.json({
        isImpersonating: false,
        session: null,
        message: "Impersonation session expired",
      });
    }

    return NextResponse.json({
      isImpersonating: true,
      session: {
        id: session.id,
        startedAt: session.started_at,
        reason: session.reason,
        impersonatedUser: session.impersonated_user,
        tenant: session.tenant,
        expiresAt: new Date(new Date(session.started_at).getTime() + maxAge).toISOString(),
      },
    });
  } catch (error) {
    console.error("Error checking impersonation status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
