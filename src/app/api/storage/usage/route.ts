import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * Sum file_size across all rows in a table for a tenant.
 * Supabase PostgREST returns max 1000 rows per request, so we paginate.
 */
async function sumFileSizes(
  supabase: SupabaseClient,
  table: string,
  tenantId: string
): Promise<number> {
  let total = 0;
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("file_size")
      .eq("tenant_id", tenantId)
      .range(offset, offset + pageSize - 1);

    if (error || !data || data.length === 0) break;
    total += data.reduce((sum: number, row: { file_size: number | null }) => sum + (row.file_size || 0), 0);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return total;
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

    // Calculate storage usage by summing file_size with pagination
    // PostgREST caps responses at 1000 rows, so we page through all rows
    const [media, recordings, voicemails, faxes, meetings, messagesResult] = await Promise.all([
      sumFileSizes(supabase, "media_files", context.tenantId),
      sumFileSizes(supabase, "call_recordings", context.tenantId),
      sumFileSizes(supabase, "voicemails", context.tenantId),
      sumFileSizes(supabase, "faxes", context.tenantId),
      sumFileSizes(supabase, "meeting_recordings", context.tenantId),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("tenant_id", context.tenantId),
    ]);

    const storageBreakdown = {
      messages: messagesResult.count || 0,
      media,
      recordings,
      voicemails,
      faxes,
      meetings,
    };

    const totalStorageBytes = media + recordings + voicemails + faxes + meetings;

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
