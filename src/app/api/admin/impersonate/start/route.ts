import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { logAuditEvent } from "@/lib/audit";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    console.log("[Impersonate] Starting impersonation request");
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      console.log("[Impersonate] Not authenticated");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super admins can impersonate
    if (context.role !== "super_admin") {
      console.log("[Impersonate] Not super admin:", context.role);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, reason } = body;
    console.log("[Impersonate] Request for user:", userId);

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Get the target user's info
    const { data: targetUser, error: userError } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, role, is_protected")
      .eq("id", userId)
      .single();

    if (userError || !targetUser) {
      console.error("[Impersonate] User not found:", userId, userError);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.log("[Impersonate] Found user:", targetUser.email);

    // Cannot impersonate other super admins
    if (targetUser.role === "super_admin") {
      return NextResponse.json(
        { error: "Cannot impersonate other super admins" },
        { status: 403 }
      );
    }

    // Cannot impersonate protected users
    if (targetUser.is_protected) {
      return NextResponse.json(
        { error: "Cannot impersonate protected users" },
        { status: 403 }
      );
    }

    // Get the user's first tenant for context
    const { data: userTenant } = await supabase
      .from("user_tenants")
      .select("tenant_id, tenants(id, name)")
      .eq("user_id", userId)
      .limit(1)
      .single();

    if (!userTenant) {
      return NextResponse.json(
        { error: "User has no tenant access" },
        { status: 400 }
      );
    }

    // End any existing active impersonation session for this super admin
    await supabase
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("super_admin_id", context.userId)
      .is("ended_at", null);

    // Create impersonation session
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null;

    const { data: session, error: sessionError } = await supabase
      .from("impersonation_sessions")
      .insert({
        super_admin_id: context.userId,
        impersonated_user_id: userId,
        tenant_id: userTenant.tenant_id,
        reason: reason || null,
        ip_address: ipAddress,
        user_agent: request.headers.get("user-agent"),
      })
      .select()
      .single();

    if (sessionError) {
      console.error("[Impersonate] Error creating session:", sessionError);
      // Check if it's a table not found error
      if (sessionError.message?.includes("relation") && sessionError.message?.includes("does not exist")) {
        return NextResponse.json(
          { error: "Impersonation not available - database table not created" },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "Failed to create impersonation session" },
        { status: 500 }
      );
    }
    console.log("[Impersonate] Session created:", session.id);

    // Set impersonation cookies
    const cookieStore = await cookies();
    cookieStore.set("impersonationSessionId", session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60, // 1 hour
    });
    cookieStore.set("impersonatedUserId", userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60,
    });
    cookieStore.set("currentTenantId", userTenant.tenant_id, {
      httpOnly: false, // Needs to be readable by client
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60,
    });

    // Log audit event
    await logAuditEvent({
      action: "user.impersonated",
      entityType: "user",
      entityId: userId,
      userId: context.userId,
      tenantId: userTenant.tenant_id,
      request,
      newValues: {
        impersonated_user_email: targetUser.email,
        impersonated_user_name: targetUser.full_name,
        reason,
      },
    });

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        impersonatedUser: {
          id: targetUser.id,
          email: targetUser.email,
          full_name: targetUser.full_name,
        },
        tenant: userTenant.tenants,
      },
    });
  } catch (error) {
    console.error("Error starting impersonation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
