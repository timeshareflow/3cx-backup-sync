import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSyncError } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// Max minutes since last success before alerting
const STALENESS_THRESHOLDS: Record<string, { warning: number; critical: number }> = {
  messages:   { warning: 10,  critical: 15 },
  media:      { warning: 20,  critical: 30 },
  cdr:        { warning: 15,  critical: 30 },
  recordings: { warning: 30,  critical: 60 },
  voicemails: { warning: 30,  critical: 60 },
  faxes:      { warning: 30,  critical: 60 },
  meetings:   { warning: 30,  critical: 60 },
  extensions: { warning: 90,  critical: 120 },
};

type HealthLevel = "healthy" | "warning" | "critical";

interface SyncTypeHealth {
  sync_type: string;
  health: HealthLevel;
  staleness_minutes: number;
  last_success_at: string | null;
  last_error: string | null;
  status: string;
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    // Get all active tenants
    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, name")
      .eq("is_active", true);

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({ status: "ok", message: "No active tenants" });
    }

    const results: {
      tenant_id: string;
      tenant_name: string;
      overall_health: HealthLevel;
      sync_types: SyncTypeHealth[];
      alerts_sent: string[];
    }[] = [];

    for (const tenant of tenants) {
      // Get sync status for this tenant
      const { data: syncStatuses } = await supabase
        .from("sync_status")
        .select("sync_type, status, last_sync_at, last_success_at, last_error_at, last_error, items_failed")
        .eq("tenant_id", tenant.id);

      if (!syncStatuses || syncStatuses.length === 0) continue;

      const now = Date.now();
      const syncTypeHealths: SyncTypeHealth[] = [];
      const alertsSent: string[] = [];
      let overallHealth: HealthLevel = "healthy";

      for (const sync of syncStatuses) {
        const thresholds = STALENESS_THRESHOLDS[sync.sync_type] || { warning: 30, critical: 60 };

        // Calculate staleness
        const lastSuccess = sync.last_success_at ? new Date(sync.last_success_at).getTime() : 0;
        const stalenessMinutes = lastSuccess > 0 ? Math.round((now - lastSuccess) / 60000) : 9999;

        // Determine health
        let health: HealthLevel = "healthy";
        if (stalenessMinutes >= thresholds.critical) {
          health = "critical";
        } else if (stalenessMinutes >= thresholds.warning) {
          health = "warning";
        }

        // Check for active errors (error happened after last success)
        const lastError = sync.last_error_at ? new Date(sync.last_error_at).getTime() : 0;
        if (lastError > lastSuccess && sync.status === "error") {
          health = "critical";
        }

        syncTypeHealths.push({
          sync_type: sync.sync_type,
          health,
          staleness_minutes: stalenessMinutes,
          last_success_at: sync.last_success_at,
          last_error: sync.last_error,
          status: sync.status,
        });

        // Update overall health
        if (health === "critical") overallHealth = "critical";
        else if (health === "warning" && overallHealth !== "critical") overallHealth = "warning";

        // Send notification for critical sync types
        if (health === "critical") {
          const shouldNotify = await checkRateLimit(supabase, tenant.id, sync.sync_type);

          if (shouldNotify) {
            // Get admin users for this tenant
            const { data: adminUsers } = await supabase
              .from("user_tenants")
              .select("user_id, user_profiles(id, full_name, email)")
              .eq("tenant_id", tenant.id)
              .in("role", ["admin", "owner"]);

            if (adminUsers && adminUsers.length > 0) {
              const errorMessage = sync.last_error
                ? `${sync.sync_type} sync has been failing: ${sync.last_error}`
                : `${sync.sync_type} sync has not succeeded in ${stalenessMinutes} minutes`;

              for (const admin of adminUsers) {
                const profile = (Array.isArray(admin.user_profiles) ? admin.user_profiles[0] : admin.user_profiles) as { id: string; full_name: string | null; email: string } | null;
                if (profile) {
                  try {
                    await sendSyncError(profile.id, tenant.id, {
                      user_name: profile.full_name || profile.email.split("@")[0],
                      tenant_name: tenant.name,
                      error_message: errorMessage,
                    });
                    alertsSent.push(`${sync.sync_type} -> ${profile.email}`);
                  } catch (err) {
                    console.error(`Failed to send sync alert to ${profile.email}:`, err);
                  }
                }
              }

              // Log the notification to prevent spam
              await supabase.from("notification_logs").insert({
                tenant_id: tenant.id,
                notification_type: "sync_health_alert",
                channel: "email",
                recipient: "admins",
                subject: `Sync Alert: ${sync.sync_type} stalled`,
                status: "sent",
                metadata: {
                  sync_type: sync.sync_type,
                  staleness_minutes: stalenessMinutes,
                  health,
                },
                sent_at: new Date().toISOString(),
              });
            }
          }
        }
      }

      results.push({
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        overall_health: overallHealth,
        sync_types: syncTypeHealths,
        alerts_sent: alertsSent,
      });
    }

    const overallStatus = results.some((r) => r.overall_health === "critical")
      ? "critical"
      : results.some((r) => r.overall_health === "warning")
        ? "warning"
        : "healthy";

    return NextResponse.json({
      status: overallStatus,
      checked_at: new Date().toISOString(),
      tenants: results,
    });
  } catch (error) {
    console.error("Health check error:", error);
    return NextResponse.json(
      { status: "error", error: (error as Error).message },
      { status: 500 }
    );
  }
}

// Check if we've already sent an alert for this sync type in the last hour
async function checkRateLimit(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  syncType: string
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("notification_logs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("notification_type", "sync_health_alert")
    .gt("sent_at", oneHourAgo)
    .contains("metadata", { sync_type: syncType })
    .limit(1);

  return !data || data.length === 0;
}
