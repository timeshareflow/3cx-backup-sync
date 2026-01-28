import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only super admins can view audit logs
    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = (page - 1) * limit;

    // Filter parameters
    const actionFilter = searchParams.get("action");
    const entityTypeFilter = searchParams.get("entityType");
    const tenantIdFilter = searchParams.get("tenantId");
    const userIdFilter = searchParams.get("userId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");

    const supabase = createAdminClient();

    // Build query
    let query = supabase
      .from("audit_logs")
      .select(
        `
        *,
        user:user_profiles!audit_logs_user_id_fkey(id, email, full_name),
        tenant:tenants!audit_logs_tenant_id_fkey(id, name, slug)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    // Apply filters
    if (actionFilter) {
      query = query.eq("action", actionFilter);
    }
    if (entityTypeFilter) {
      query = query.eq("entity_type", entityTypeFilter);
    }
    if (tenantIdFilter) {
      query = query.eq("tenant_id", tenantIdFilter);
    }
    if (userIdFilter) {
      query = query.eq("user_id", userIdFilter);
    }
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }
    if (search) {
      // Search in entity_id or action
      query = query.or(`entity_id.ilike.%${search}%,action.ilike.%${search}%`);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: logs, error, count } = await query;

    if (error) {
      console.error("Error fetching audit logs:", error);
      return NextResponse.json(
        { error: "Failed to fetch audit logs", details: error.message },
        { status: 500 }
      );
    }

    // Get distinct actions and entity types for filter dropdowns
    const { data: actions } = await supabase
      .from("audit_logs")
      .select("action")
      .limit(100);

    const { data: entityTypes } = await supabase
      .from("audit_logs")
      .select("entity_type")
      .limit(100);

    const uniqueActions = [...new Set((actions || []).map((a) => a.action))].sort();
    const uniqueEntityTypes = [...new Set((entityTypes || []).map((e) => e.entity_type))].filter(Boolean).sort();

    return NextResponse.json({
      logs: logs || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      filters: {
        actions: uniqueActions,
        entityTypes: uniqueEntityTypes,
      },
    });
  } catch (error) {
    console.error("Error in audit logs API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Export audit logs to CSV
export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (context.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { startDate, endDate, action, entityType, tenantId } = body;

    const supabase = createAdminClient();

    let query = supabase
      .from("audit_logs")
      .select(
        `
        id,
        action,
        entity_type,
        entity_id,
        old_values,
        new_values,
        ip_address,
        user_agent,
        created_at,
        user:user_profiles!audit_logs_user_id_fkey(email, full_name),
        tenant:tenants!audit_logs_tenant_id_fkey(name)
      `
      )
      .order("created_at", { ascending: false })
      .limit(10000); // Max 10k rows for export

    if (startDate) query = query.gte("created_at", startDate);
    if (endDate) query = query.lte("created_at", endDate);
    if (action) query = query.eq("action", action);
    if (entityType) query = query.eq("entity_type", entityType);
    if (tenantId) query = query.eq("tenant_id", tenantId);

    const { data: logs, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Failed to export audit logs" },
        { status: 500 }
      );
    }

    // Convert to CSV format
    const headers = [
      "Timestamp",
      "Action",
      "Entity Type",
      "Entity ID",
      "User",
      "User Email",
      "Tenant",
      "IP Address",
      "Old Values",
      "New Values",
    ];

    const rows = (logs || []).map((log) => [
      log.created_at,
      log.action,
      log.entity_type || "",
      log.entity_id || "",
      (log.user as { full_name?: string })?.full_name || "",
      (log.user as { email?: string })?.email || "",
      (log.tenant as { name?: string })?.name || "",
      log.ip_address || "",
      log.old_values ? JSON.stringify(log.old_values) : "",
      log.new_values ? JSON.stringify(log.new_values) : "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="audit-logs-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting audit logs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
