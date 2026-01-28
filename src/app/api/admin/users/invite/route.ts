import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, parseJsonBody } from "@/lib/api-utils";
import { rateLimitConfigs } from "@/lib/rate-limit";
import { logUserAction } from "@/lib/audit";
import { sendInviteEmail, sendWelcomeEmail } from "@/lib/notifications/email";

interface InviteRequest {
  email: string;
  fullName?: string;
  role: "admin" | "manager" | "user";
  temporaryPassword?: string;
}

export async function POST(request: NextRequest) {
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

    // Check if user already exists in user_profiles
    const { data: existingUsers } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("email", email.toLowerCase())
      .limit(1);

    if (existingUsers && existingUsers.length > 0) {
      // User exists in profiles - add them to this tenant if not already
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

    // Also check if user exists in Supabase Auth (orphaned auth user without profile)
    const { data: authUserData } = await supabase.auth.admin.listUsers();
    const existingAuthUser = authUserData?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (existingAuthUser) {
      // User exists in Auth but not in profiles - create profile and add to tenant
      console.log("Found orphaned auth user, creating profile:", existingAuthUser.id);

      // Create the missing profile
      const { error: profileError } = await supabase
        .from("user_profiles")
        .insert({
          id: existingAuthUser.id,
          email: email.toLowerCase(),
          full_name: fullName || null,
          role: "user",
        });

      if (profileError && !profileError.message.includes("duplicate")) {
        console.error("Error creating profile for orphaned user:", profileError);
      }

      // Check if already in tenant
      const { data: existingTenantUser } = await supabase
        .from("user_tenants")
        .select("id")
        .eq("user_id", existingAuthUser.id)
        .eq("tenant_id", context.tenantId)
        .single();

      if (existingTenantUser) {
        return NextResponse.json({ error: "User is already a member of this tenant" }, { status: 400 });
      }

      // Add user to tenant
      const { error: tenantError } = await supabase
        .from("user_tenants")
        .insert({
          user_id: existingAuthUser.id,
          tenant_id: context.tenantId,
          role: role,
          invited_by: context.userId,
        });

      if (tenantError) {
        console.error("Error adding orphaned user to tenant:", tenantError);
        return NextResponse.json({ error: "Failed to add user to tenant" }, { status: 500 });
      }

      // Generate a recovery link so user can set their password
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://3cxbackupwiz.vercel.app";
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email: email,
        options: {
          redirectTo: `${appUrl}/auth/callback?next=/auth/reset-password`,
        },
      });

      let emailSent = false;
      let emailError: string | undefined;

      if (linkError) {
        console.error("Error generating recovery link for orphaned user:", linkError);
        emailError = linkError.message;
      } else if (linkData?.properties?.action_link) {
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("name")
          .eq("id", context.tenantId)
          .single();

        const emailResult = await sendInviteEmail(
          email,
          fullName || "",
          linkData.properties.action_link,
          tenantData?.name
        );

        if (emailResult.success) {
          emailSent = true;
        } else {
          console.error("Failed to send invite email for orphaned user:", emailResult.error);
          emailError = emailResult.error;
        }
      } else {
        emailError = "No recovery link generated";
      }

      // Log audit event
      await logUserAction("user.created", existingAuthUser.id, {
        userId: context.userId,
        tenantId: context.tenantId,
        request,
        newValues: {
          email: email.toLowerCase(),
          full_name: fullName || null,
          role: role,
          invited_by: context.userId,
          note: "Recovered orphaned auth user",
        },
      });

      // Build response message based on email result
      let message = "User account recovered and added to tenant.";
      if (emailSent) {
        message += " Invitation email sent.";
      } else if (emailError) {
        message += ` Email failed to send (${emailError}). They can use 'Forgot Password' on the login page.`;
      } else {
        message += " They can use 'Forgot Password' on the login page to set their password.";
      }

      return NextResponse.json({
        success: true,
        message
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

      // Send welcome email with temporary password via SendGrid
      const welcomeResult = await sendWelcomeEmail(email, fullName || "", temporaryPassword);
      if (welcomeResult.success) {
        responseMessage = "User created and welcome email sent with temporary password. They must change it on first login.";
      } else {
        console.error("Failed to send welcome email:", welcomeResult.error);
        responseMessage = `User created with temporary password "${temporaryPassword}". Welcome email failed to send (${welcomeResult.error}).`;
      }
    } else {
      // Create new user and send invite via our email system (SendGrid)
      // First, create the user with a temporary random password
      const tempPassword = crypto.randomUUID().slice(0, 16) + "Aa1!"; // Random password meeting requirements

      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email: email,
        password: tempPassword,
        email_confirm: true, // Auto-confirm so they can use recovery link
        user_metadata: {
          invited_to_tenant: context.tenantId,
          tenant_role: role,
          invited_by: context.userId,
          password_change_required: true,
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

      // Generate an invite/recovery link so user can set their own password
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email: email,
        options: {
          redirectTo: `${appUrl}/auth/callback?next=/auth/reset-password`,
        },
      });

      if (linkError || !linkData.properties?.action_link) {
        console.error("Error generating invite link:", linkError);
        // Fall back to welcome email with message to use "Forgot Password"
        responseMessage = "User created. They should use 'Forgot Password' on the login page to set their password.";
      } else {
        // Get tenant name for the email
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("name")
          .eq("id", context.tenantId)
          .single();

        // Send invite email via our email system (SendGrid)
        const emailResult = await sendInviteEmail(
          email,
          fullName || "",
          linkData.properties.action_link,
          tenantData?.name
        );

        if (emailResult.success) {
          responseMessage = "Invitation email sent. User will set their password when they click the link.";
        } else {
          console.error("Failed to send invite email:", emailResult.error);
          // User was created, but email failed - they can use forgot password
          responseMessage = `User created but email failed to send (${emailResult.error}). They can use 'Forgot Password' on the login page.`;
        }
      }
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

    // Log audit event for user creation
    await logUserAction("user.created", newUserId, {
      userId: context.userId,
      tenantId: context.tenantId,
      request,
      newValues: {
        email: email.toLowerCase(),
        full_name: fullName || null,
        role: role,
        invited_by: context.userId,
      },
    });

    return NextResponse.json({
      success: true,
      message: responseMessage
    });
  } catch (error) {
    console.error("Error inviting user:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
