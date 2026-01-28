import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("impersonationSessionId")?.value;
    const impersonatedUserId = cookieStore.get("impersonatedUserId")?.value;

    if (!sessionId) {
      return NextResponse.json(
        { error: "No active impersonation session" },
        { status: 400 }
      );
    }

    // Get current user (the super admin)
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Verify the session belongs to this super admin
    const { data: session, error: sessionError } = await supabase
      .from("impersonation_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("super_admin_id", user.id)
      .is("ended_at", null)
      .single();

    if (sessionError || !session) {
      // Clear cookies anyway if session is invalid
      cookieStore.delete("impersonationSessionId");
      cookieStore.delete("impersonatedUserId");
      cookieStore.delete("currentTenantId");

      return NextResponse.json({
        success: true,
        message: "Impersonation ended (session already expired)",
      });
    }

    // End the session
    const { error: updateError } = await supabase
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId);

    if (updateError) {
      console.error("Error ending impersonation session:", updateError);
    }

    // Clear impersonation cookies
    cookieStore.delete("impersonationSessionId");
    cookieStore.delete("impersonatedUserId");
    cookieStore.delete("currentTenantId");

    // Log audit event
    await logAuditEvent({
      action: "user.impersonation_ended",
      entityType: "user",
      entityId: impersonatedUserId || session.impersonated_user_id,
      userId: user.id,
      tenantId: session.tenant_id,
      request,
      newValues: {
        session_duration_minutes: Math.round(
          (Date.now() - new Date(session.started_at).getTime()) / 1000 / 60
        ),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Impersonation ended successfully",
    });
  } catch (error) {
    console.error("Error stopping impersonation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
