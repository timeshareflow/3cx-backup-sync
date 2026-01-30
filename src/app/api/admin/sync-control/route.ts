import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";

const SYNC_SERVICE_URL = process.env.SYNC_SERVICE_URL || "http://localhost:3001";
const SYNC_AUTH_TOKEN = process.env.SYNC_AUTH_TOKEN;

async function verifySuperAdmin(): Promise<{ authorized: boolean; error?: string }> {
  const context = await getTenantContext();

  if (!context.isAuthenticated) {
    return { authorized: false, error: "Unauthorized" };
  }

  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", context.userId)
    .single();

  if (profile?.role !== "super_admin") {
    return { authorized: false, error: "Forbidden - Super admin only" };
  }

  return { authorized: true };
}

// GET: Get sync service status
export async function GET() {
  const auth = await verifySuperAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "Unauthorized" ? 401 : 403 });
  }

  if (!SYNC_AUTH_TOKEN) {
    return NextResponse.json({ error: "Sync service not configured" }, { status: 500 });
  }

  try {
    const response = await fetch(`${SYNC_SERVICE_URL}/status`, {
      headers: { Authorization: `Bearer ${SYNC_AUTH_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({
      status: "offline",
      error: "Could not reach sync service",
    });
  }
}

// POST: Trigger sync or restart
export async function POST(request: NextRequest) {
  const auth = await verifySuperAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "Unauthorized" ? 401 : 403 });
  }

  if (!SYNC_AUTH_TOKEN) {
    return NextResponse.json({ error: "Sync service not configured" }, { status: 500 });
  }

  const { action } = await request.json();

  if (!["sync", "restart"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    const response = await fetch(`${SYNC_SERVICE_URL}/${action}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_AUTH_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Status ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
