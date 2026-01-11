import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { testSmtpConnection, testSmsConnection, testPushConnection, sendEmail, sendSms } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super admins can test notifications
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { channel, recipient } = body;

    if (!channel) {
      return NextResponse.json(
        { error: "Channel is required (email, sms, or push)" },
        { status: 400 }
      );
    }

    switch (channel) {
      case "email": {
        // First test connection
        const connectionTest = await testSmtpConnection();
        if (!connectionTest.success) {
          return NextResponse.json({
            success: false,
            error: connectionTest.error || "SMTP connection failed",
          });
        }

        // If recipient provided, send test email
        if (recipient) {
          const result = await sendEmail({
            to: recipient,
            subject: "3CX BackupWiz - Test Email",
            html: `
              <h2>Test Email</h2>
              <p>This is a test email from 3CX BackupWiz.</p>
              <p>If you received this, your email configuration is working correctly!</p>
              <p><em>Sent at: ${new Date().toISOString()}</em></p>
            `,
            text: "This is a test email from 3CX BackupWiz. If you received this, your email configuration is working correctly!",
          });

          return NextResponse.json({
            success: result.success,
            messageId: result.messageId,
            error: result.error,
          });
        }

        return NextResponse.json({
          success: true,
          message: "SMTP connection successful",
        });
      }

      case "sms": {
        // First test connection
        const connectionTest = await testSmsConnection();
        if (!connectionTest.success) {
          return NextResponse.json({
            success: false,
            error: connectionTest.error || "SMS connection failed",
          });
        }

        // If recipient provided, send test SMS
        if (recipient) {
          const result = await sendSms({
            to: recipient,
            message: "3CX BackupWiz Test: Your SMS configuration is working correctly!",
          });

          return NextResponse.json({
            success: result.success,
            messageId: result.messageId,
            error: result.error,
          });
        }

        return NextResponse.json({
          success: true,
          message: "SMS connection successful",
        });
      }

      case "push": {
        const result = await testPushConnection();
        return NextResponse.json({
          success: result.success,
          error: result.error,
          message: result.success ? "Push notification connection successful" : undefined,
        });
      }

      default:
        return NextResponse.json(
          { error: "Invalid channel. Use email, sms, or push" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error testing notification:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Test all channels
    const [emailResult, smsResult, pushResult] = await Promise.all([
      testSmtpConnection(),
      testSmsConnection(),
      testPushConnection(),
    ]);

    return NextResponse.json({
      email: emailResult,
      sms: smsResult,
      push: pushResult,
    });
  } catch (error) {
    console.error("Error testing notifications:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
