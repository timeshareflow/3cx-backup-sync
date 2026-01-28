import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";
import { sendInviteEmail } from "@/lib/notifications/email";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const context = await getTenantContext();

    if (!context.isAuthenticated || !context.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant context" }, { status: 403 });
    }

    const supabase = createAdminClient();

    // Check if current user has admin access
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", context.userId)
      .single();

    const isSuperAdmin = profile?.role === "super_admin";

    // Check tenant role if not super admin
    let isTenantAdmin = false;
    if (!isSuperAdmin) {
      const { data: tenantRole } = await supabase
        .from("user_tenants")
        .select("role")
        .eq("user_id", context.userId)
        .eq("tenant_id", context.tenantId)
        .single();
      isTenantAdmin = tenantRole?.role === "admin";
    }

    if (!isSuperAdmin && !isTenantAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get the target user's info
    const { data: targetUser, error: userError } = await supabase
      .from("user_profiles")
      .select("id, email, full_name")
      .eq("id", id)
      .single();

    if (userError || !targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if the user belongs to this tenant
    const { data: userTenant } = await supabase
      .from("user_tenants")
      .select("id")
      .eq("user_id", id)
      .eq("tenant_id", context.tenantId)
      .single();

    if (!userTenant) {
      return NextResponse.json({ error: "User not in this tenant" }, { status: 404 });
    }

    // Get tenant name for the email
    const { data: tenantData } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", context.tenantId)
      .single();

    // Generate a password recovery link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://3cxbackupwiz.vercel.app";
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: targetUser.email,
      options: {
        redirectTo: `${appUrl}/auth/callback?next=/auth/reset-password`,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("Error generating invite link:", linkError);
      return NextResponse.json({
        error: "Failed to generate invite link. User can use 'Forgot Password' on login page."
      }, { status: 500 });
    }

    // Send the invite email
    const emailResult = await sendInviteEmail(
      targetUser.email,
      targetUser.full_name || "",
      linkData.properties.action_link,
      tenantData?.name
    );

    if (emailResult.success) {
      return NextResponse.json({
        success: true,
        message: "Invite email sent successfully"
      });
    } else {
      return NextResponse.json({
        success: false,
        error: `Failed to send email: ${emailResult.error}`
      }, { status: 500 });
    }
  } catch (error) {
    console.error("Error resending invite:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
