import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant context" }, { status: 400 });
    }

    const supabase = await createClient();

    // Get tenant with storage plan
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select(`
        *,
        storage_plans (*)
      `)
      .eq("id", context.tenantId)
      .single();

    if (tenantError || !tenant) {
      console.error("Error fetching tenant:", tenantError);
      return NextResponse.json(
        { error: "Failed to fetch tenant data" },
        { status: 500 }
      );
    }

    // Calculate current storage usage
    const [messagesResult, mediaResult, recordingsResult, voicemailsResult, faxesResult, meetingsResult] = await Promise.all([
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("tenant_id", context.tenantId),
      supabase.from("media_files").select("file_size").eq("tenant_id", context.tenantId),
      supabase.from("call_recordings").select("file_size").eq("tenant_id", context.tenantId),
      supabase.from("voicemails").select("file_size").eq("tenant_id", context.tenantId),
      supabase.from("faxes").select("file_size").eq("tenant_id", context.tenantId),
      supabase.from("meeting_recordings").select("file_size").eq("tenant_id", context.tenantId),
    ]);

    // Sum up file sizes
    const sumFileSize = (data: { file_size: number | null }[] | null) => {
      if (!data) return 0;
      return data.reduce((sum, item) => sum + (item.file_size || 0), 0);
    };

    const storageBreakdown = {
      messages: messagesResult.count || 0, // Just count, no actual file storage
      media: sumFileSize(mediaResult.data),
      recordings: sumFileSize(recordingsResult.data),
      voicemails: sumFileSize(voicemailsResult.data),
      faxes: sumFileSize(faxesResult.data),
      meetings: sumFileSize(meetingsResult.data),
    };

    const totalStorageBytes =
      storageBreakdown.media +
      storageBreakdown.recordings +
      storageBreakdown.voicemails +
      storageBreakdown.faxes +
      storageBreakdown.meetings;

    // Get plan limits
    const plan = tenant.storage_plans;
    const storageLimitBytes = plan ? plan.storage_limit_gb * 1024 * 1024 * 1024 : 0; // 0 means unlimited
    const isUnlimited = !plan || plan.storage_limit_gb === 0;
    const storagePercentage = isUnlimited ? 0 : Math.round((totalStorageBytes / storageLimitBytes) * 100);

    // Determine warning levels
    let warningLevel: "none" | "approaching" | "critical" | "exceeded" = "none";
    if (!isUnlimited) {
      if (storagePercentage >= 100) {
        warningLevel = "exceeded";
      } else if (storagePercentage >= 90) {
        warningLevel = "critical";
      } else if (storagePercentage >= 75) {
        warningLevel = "approaching";
      }
    }

    // Format for human display
    const formatBytes = (bytes: number) => {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB", "TB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    return NextResponse.json({
      storage: {
        used: totalStorageBytes,
        usedFormatted: formatBytes(totalStorageBytes),
        limit: storageLimitBytes,
        limitFormatted: isUnlimited ? "Unlimited" : formatBytes(storageLimitBytes),
        percentage: storagePercentage,
        isUnlimited,
        warningLevel,
      },
      breakdown: {
        media: {
          bytes: storageBreakdown.media,
          formatted: formatBytes(storageBreakdown.media),
        },
        recordings: {
          bytes: storageBreakdown.recordings,
          formatted: formatBytes(storageBreakdown.recordings),
        },
        voicemails: {
          bytes: storageBreakdown.voicemails,
          formatted: formatBytes(storageBreakdown.voicemails),
        },
        faxes: {
          bytes: storageBreakdown.faxes,
          formatted: formatBytes(storageBreakdown.faxes),
        },
        meetings: {
          bytes: storageBreakdown.meetings,
          formatted: formatBytes(storageBreakdown.meetings),
        },
      },
      counts: {
        messages: storageBreakdown.messages,
      },
      plan: plan ? {
        id: plan.id,
        name: plan.name,
        storageLimitGb: plan.storage_limit_gb,
        priceMonthly: plan.price_monthly,
      } : null,
      lastCalculatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in storage usage API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
