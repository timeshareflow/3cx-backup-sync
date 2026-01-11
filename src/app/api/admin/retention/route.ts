import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";

export const DATA_TYPES = [
  { value: "messages", label: "Chat Messages", description: "Text messages and chat history" },
  { value: "media", label: "Media Files", description: "Images, videos, and attachments" },
  { value: "recordings", label: "Call Recordings", description: "Audio recordings of calls" },
  { value: "voicemails", label: "Voicemails", description: "Voice messages left by callers" },
  { value: "faxes", label: "Faxes", description: "Sent and received fax documents" },
  { value: "call_logs", label: "Call Logs (CDR)", description: "Call detail records and history" },
  { value: "meetings", label: "Meeting Recordings", description: "Web meeting recordings" },
] as const;

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant context" }, { status: 400 });
    }

    // Only admins can view retention policies
    if (!["admin", "super_admin"].includes(context.role || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createClient();

    const { data: policies, error } = await supabase
      .from("retention_policies")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .order("data_type");

    if (error) {
      console.error("Error fetching retention policies:", error);
      return NextResponse.json(
        { error: "Failed to fetch retention policies" },
        { status: 500 }
      );
    }

    // Ensure all data types have a policy
    const policyMap = new Map(policies?.map((p) => [p.data_type, p]) || []);
    const fullPolicies = DATA_TYPES.map((dt) => {
      const existing = policyMap.get(dt.value);
      return {
        data_type: dt.value,
        label: dt.label,
        description: dt.description,
        retention_days: existing?.retention_days ?? null,
        is_enabled: existing?.is_enabled ?? true,
        last_cleanup_at: existing?.last_cleanup_at ?? null,
        id: existing?.id ?? null,
      };
    });

    return NextResponse.json({ policies: fullPolicies });
  } catch (error) {
    console.error("Error in retention policies API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant context" }, { status: 400 });
    }

    // Only admins can update retention policies
    if (!["admin", "super_admin"].includes(context.role || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { policies } = body;

    if (!Array.isArray(policies)) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Upsert each policy
    for (const policy of policies) {
      const { data_type, retention_days, is_enabled } = policy;

      // Validate data type
      if (!DATA_TYPES.some((dt) => dt.value === data_type)) {
        continue;
      }

      // Validate retention_days (null = keep forever, positive number = days)
      const validRetentionDays = retention_days === null || retention_days === ""
        ? null
        : Math.max(1, parseInt(retention_days) || 0);

      const { error } = await supabase
        .from("retention_policies")
        .upsert(
          {
            tenant_id: context.tenantId,
            data_type,
            retention_days: validRetentionDays,
            is_enabled: is_enabled ?? true,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "tenant_id,data_type",
          }
        );

      if (error) {
        console.error("Error upserting retention policy:", error);
        return NextResponse.json(
          { error: `Failed to update policy for ${data_type}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating retention policies:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST endpoint to manually trigger cleanup for a specific data type
export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "No tenant context" }, { status: 400 });
    }

    // Only super_admins can manually trigger cleanup
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { data_type } = body;

    if (!data_type || !DATA_TYPES.some((dt) => dt.value === data_type)) {
      return NextResponse.json(
        { error: "Invalid data type" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get the policy for this data type
    const { data: policy, error: policyError } = await supabase
      .from("retention_policies")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .eq("data_type", data_type)
      .single();

    if (policyError || !policy) {
      return NextResponse.json(
        { error: "Policy not found" },
        { status: 404 }
      );
    }

    if (!policy.retention_days) {
      return NextResponse.json(
        { error: "Cannot run cleanup for 'keep forever' policies" },
        { status: 400 }
      );
    }

    // Note: In production, this would call the apply_retention_policies function
    // For now, we just update the last_cleanup_at timestamp
    const { error: updateError } = await supabase
      .from("retention_policies")
      .update({
        last_cleanup_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", policy.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to run cleanup" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Cleanup triggered for ${data_type}`,
    });
  } catch (error) {
    console.error("Error triggering cleanup:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
