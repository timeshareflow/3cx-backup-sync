import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { NextResponse } from "next/server";
import { withRateLimit, parseJsonBody } from "@/lib/api-utils";
import { rateLimitConfigs } from "@/lib/rate-limit";

interface InviteRequest {
  email: string;
  fullName?: string;
  role: "admin" | "manager" | "user";
  temporaryPassword?: string;
}

export async function POST(request: Request) {
  // Rate limit: 50 admin operations per minute
  const rateLimited = withRateLimit(request, rateLimitConfigs.admin);
  if (rateLimited) return rateLimited;

  try {
    const parsed = await parseJsonBody<InviteRequest>(request);
    if ("error" in parsed) return parsed.error;

    const { email, fullName, role, temporaryPassword } = parsed.data;
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

    // Only super_admin or tenant admin can create admin users
    if (role === "admin" && !isSuperAdmin && !isTenantAdmin) {
      return NextResponse.json({ error: "Only admins can create admin users" }, { status: 403 });
    }

    // Check if user already exists
    const { data: existingUsers } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("email", email.toLowerCase())
      .limit(1);

    if (existingUsers && existingUsers.length > 0) {
      // User exists - add them to this tenant if not already
      const existingUserId = existingUsers[0].id;

      const { data: existingTenantUser } = await supabase
        .from("user_tenants")
        .select("id")
        .eq("user_id", existingUserId)
        .eq("tenant_id", context.tenantId)
        .single();

      if (existingTenantUser) {
        return NextResponse.json({ error: "User is already a member of this tenant" }, { status: 400 });
      }

      // Add user to tenant
      const { error: tenantError } = await supabase
        .from("user_tenants")
        .insert({
          user_id: existingUserId,
          tenant_id: context.tenantId,
          role: role,
          invited_by: context.userId,
        });

      if (tenantError) {
        console.error("Error adding user to tenant:", tenantError);
        return NextResponse.json({ error: "Failed to add user to tenant" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "Existing user added to tenant"
      });
    }

    // Get the app URL for the redirect
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://3cxbackupwiz.vercel.app";

    let newUserId: string;
    let responseMessage: string;

    if (temporaryPassword) {
      // Create user with temporary password (must change on first login)
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email: email,
        password: temporaryPassword,
        email_confirm: true, // Auto-confirm email since admin is creating the account
        user_metadata: {
          invited_to_tenant: context.tenantId,
          tenant_role: role,
          invited_by: context.userId,
          password_change_required: true, // Flag for forced password change
        },
      });

      if (createError) {
        console.error("Error creating user:", createError);
        return NextResponse.json({
          error: `Failed to create user: ${createError.message}`
        }, { status: 500 });
      }

      if (!createData.user) {
        return NextResponse.json({
          error: "Failed to create user: No user returned"
        }, { status: 500 });
      }

      newUserId = createData.user.id;
      responseMessage = "User created with temporary password. They must change it on first login.";
    } else {
      // Create new user with email invite
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: `${appUrl}/auth/reset-password`,
          data: {
            invited_to_tenant: context.tenantId,
            tenant_role: role,
            invited_by: context.userId,
          },
        }
      );

      if (inviteError) {
        console.error("Error inviting user:", inviteError);
        return NextResponse.json({
          error: `Failed to send invitation: ${inviteError.message}`
        }, { status: 500 });
      }

      if (!inviteData.user) {
        return NextResponse.json({
          error: "Failed to invite user: No user returned"
        }, { status: 500 });
      }

      newUserId = inviteData.user.id;
      responseMessage = "Invitation email sent. User will set their password when they click the link.";
    }

    // Create user profile
    const { error: profileError } = await supabase
      .from("user_profiles")
      .insert({
        id: newUserId,
        email: email.toLowerCase(),
        full_name: fullName || null,
        role: "user", // Global role is always user, tenant role is in user_tenants
      });

    if (profileError) {
      console.error("Error creating user profile:", profileError);
      // Don't fail - the profile will be created on first login via trigger
    }

    // Add user to tenant
    const { error: tenantError } = await supabase
      .from("user_tenants")
      .insert({
        user_id: newUserId,
        tenant_id: context.tenantId,
        role: role,
        invited_by: context.userId,
      });

    if (tenantError) {
      console.error("Error adding user to tenant:", tenantError);
      // Don't fail completely - user was created/invited
    }

    return NextResponse.json({
      success: true,
      message: responseMessage
    });
  } catch (error) {
    console.error("Error inviting user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
