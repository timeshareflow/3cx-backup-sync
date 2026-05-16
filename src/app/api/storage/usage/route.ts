import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

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

    // Single RPC call returns all 5 table sums — replaces 5 paginating loops
    const [{ data: usageRows, error: usageError }, { data: tenant, error: tenantError }, messagesResult] =
      await Promise.all([
        supabase.rpc("get_storage_usage", { p_tenant_id: context.tenantId }),
        supabase
          .from("tenants")
          .select("*, storage_plans(*)")
          .eq("id", context.tenantId)
          .single(),
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", context.tenantId),
      ]);

    if (tenantError || !tenant) {
      return NextResponse.json({ error: "Failed to fetch tenant data" }, { status: 500 });
    }

    const usage = Object.fromEntries(
      (usageRows || []).map((r: { table_name: string; total_bytes: number }) => [r.table_name, Number(r.total_bytes)])
    );

    const media      = usage["media_files"]       || 0;
    const recordings = usage["call_recordings"]   || 0;
    const voicemails = usage["voicemails"]        || 0;
    const faxes      = usage["faxes"]             || 0;
    const meetings   = usage["meeting_recordings"] || 0;
    const totalStorageBytes = media + recordings + voicemails + faxes + meetings;

    const plan = tenant.storage_plans;
    const storageLimitBytes = plan ? plan.storage_limit_gb * 1024 * 1024 * 1024 : 0;
    const isUnlimited = !plan || plan.storage_limit_gb === 0;
    const storagePercentage = isUnlimited ? 0 : Math.round((totalStorageBytes / storageLimitBytes) * 100);

    let warningLevel: "none" | "approaching" | "critical" | "exceeded" = "none";
    if (!isUnlimited) {
      if (storagePercentage >= 100) warningLevel = "exceeded";
      else if (storagePercentage >= 90) warningLevel = "critical";
      else if (storagePercentage >= 75) warningLevel = "approaching";
    }

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
        media:      { bytes: media,      formatted: formatBytes(media) },
        recordings: { bytes: recordings, formatted: formatBytes(recordings) },
        voicemails: { bytes: voicemails, formatted: formatBytes(voicemails) },
        faxes:      { bytes: faxes,      formatted: formatBytes(faxes) },
        meetings:   { bytes: meetings,   formatted: formatBytes(meetings) },
      },
      counts: {
        messages: messagesResult.count || 0,
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
