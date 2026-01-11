import { createClient } from "@/lib/supabase/server";
import { sendStorageWarning } from "./index";

interface StorageCheckResult {
  shouldNotify: boolean;
  warningLevel: "none" | "approaching" | "critical" | "exceeded";
  percentage: number;
  storageUsed: string;
  storageLimit: string;
}

/**
 * Check storage usage for a tenant and trigger notifications if needed
 */
export async function checkStorageAndNotify(tenantId: string): Promise<StorageCheckResult> {
  const supabase = await createClient();

  // Get tenant with storage plan
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select(`
      *,
      storage_plans (*)
    `)
    .eq("id", tenantId)
    .single();

  if (tenantError || !tenant) {
    console.error("Failed to fetch tenant for storage check:", tenantError);
    return {
      shouldNotify: false,
      warningLevel: "none",
      percentage: 0,
      storageUsed: "0",
      storageLimit: "0",
    };
  }

  const plan = tenant.storage_plans;

  // Skip if no plan or unlimited
  if (!plan || plan.storage_limit_gb === 0) {
    return {
      shouldNotify: false,
      warningLevel: "none",
      percentage: 0,
      storageUsed: tenant.storage_used_bytes?.toString() || "0",
      storageLimit: "Unlimited",
    };
  }

  // Calculate storage
  const [mediaResult, recordingsResult, voicemailsResult, faxesResult, meetingsResult] = await Promise.all([
    supabase.from("media_files").select("file_size").eq("tenant_id", tenantId),
    supabase.from("call_recordings").select("file_size").eq("tenant_id", tenantId),
    supabase.from("voicemails").select("file_size").eq("tenant_id", tenantId),
    supabase.from("faxes").select("file_size").eq("tenant_id", tenantId),
    supabase.from("meeting_recordings").select("file_size").eq("tenant_id", tenantId),
  ]);

  const sumFileSize = (data: { file_size: number | null }[] | null) => {
    if (!data) return 0;
    return data.reduce((sum, item) => sum + (item.file_size || 0), 0);
  };

  const totalStorageBytes =
    sumFileSize(mediaResult.data) +
    sumFileSize(recordingsResult.data) +
    sumFileSize(voicemailsResult.data) +
    sumFileSize(faxesResult.data) +
    sumFileSize(meetingsResult.data);

  const storageLimitBytes = plan.storage_limit_gb * 1024 * 1024 * 1024;
  const percentage = Math.round((totalStorageBytes / storageLimitBytes) * 100);

  // Update tenant storage_used_bytes
  await supabase
    .from("tenants")
    .update({
      storage_used_bytes: totalStorageBytes,
      storage_last_calculated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);

  // Determine warning level
  let warningLevel: "none" | "approaching" | "critical" | "exceeded" = "none";
  if (percentage >= 100) {
    warningLevel = "exceeded";
  } else if (percentage >= 90) {
    warningLevel = "critical";
  } else if (percentage >= 75) {
    warningLevel = "approaching";
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const storageUsed = formatBytes(totalStorageBytes);
  const storageLimit = formatBytes(storageLimitBytes);

  // Check if we should notify
  const shouldNotify = warningLevel !== "none";

  // Get the last notification for this tenant
  if (shouldNotify) {
    const { data: lastNotification } = await supabase
      .from("notification_logs")
      .select("created_at, metadata")
      .eq("tenant_id", tenantId)
      .eq("notification_type", "storage_warning")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Don't send if we've sent a notification for this warning level in the last 24 hours
    if (lastNotification) {
      const lastLevel = (lastNotification.metadata as { warning_level?: string })?.warning_level;
      const lastTime = new Date(lastNotification.created_at).getTime();
      const now = Date.now();
      const hoursSinceLastNotification = (now - lastTime) / (1000 * 60 * 60);

      // Skip if same warning level and less than 24 hours ago
      // Or if we've already exceeded and notified within 7 days
      if (lastLevel === warningLevel) {
        if (warningLevel === "exceeded" && hoursSinceLastNotification < 168) {
          // 7 days for exceeded
          return {
            shouldNotify: false,
            warningLevel,
            percentage,
            storageUsed,
            storageLimit,
          };
        } else if (hoursSinceLastNotification < 24) {
          // 24 hours for others
          return {
            shouldNotify: false,
            warningLevel,
            percentage,
            storageUsed,
            storageLimit,
          };
        }
      }
    }

    // Get admin users for this tenant to notify
    const { data: adminUsers } = await supabase
      .from("user_tenants")
      .select(`
        user_id,
        user_profiles (id, email, full_name)
      `)
      .eq("tenant_id", tenantId)
      .in("role", ["admin", "owner"]);

    if (adminUsers && adminUsers.length > 0) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://backupwiz.com";

      for (const adminUser of adminUsers) {
        // user_profiles may be returned as array or single object depending on Supabase version
        const profileRaw = adminUser.user_profiles;
        const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as { id: string; email: string; full_name: string | null } | null;
        if (profile) {
          await sendStorageWarning(profile.id, tenantId, {
            user_name: profile.full_name || profile.email.split("@")[0],
            storage_percentage: percentage.toString(),
            plan_name: plan.name,
            storage_used: storageUsed,
            storage_limit: storageLimit,
            upgrade_url: `${baseUrl}/admin/billing`,
          });

          // Log that we sent the notification
          await supabase.from("notification_logs").insert({
            tenant_id: tenantId,
            user_id: profile.id,
            notification_type: "storage_warning",
            channel: "email",
            recipient: profile.email,
            subject: `Storage Alert: ${percentage}% Used`,
            status: "sent",
            metadata: {
              warning_level: warningLevel,
              percentage,
            },
            sent_at: new Date().toISOString(),
          });
        }
      }
    }
  }

  return {
    shouldNotify,
    warningLevel,
    percentage,
    storageUsed,
    storageLimit,
  };
}

/**
 * Run storage check for all tenants (called by cron job)
 */
export async function checkAllTenantsStorage(): Promise<void> {
  const supabase = await createClient();

  // Get all active tenants with storage plans
  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id")
    .eq("is_active", true)
    .not("storage_plan_id", "is", null);

  if (error || !tenants) {
    console.error("Failed to fetch tenants for storage check:", error);
    return;
  }

  console.log(`Checking storage for ${tenants.length} tenants`);

  for (const tenant of tenants) {
    try {
      const result = await checkStorageAndNotify(tenant.id);
      if (result.shouldNotify) {
        console.log(`Tenant ${tenant.id}: Storage at ${result.percentage}% (${result.warningLevel})`);
      }
    } catch (error) {
      console.error(`Failed to check storage for tenant ${tenant.id}:`, error);
    }
  }
}
