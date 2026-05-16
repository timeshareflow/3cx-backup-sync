import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: { status: "ok" | "error"; latencyMs?: number; error?: string };
    environment: { status: "ok" | "warning" | "error"; missing?: string[] };
  };
}

const startTime = Date.now();

// Cache DB check result for 30 seconds — avoids a query on every load-balancer probe
let cachedDbCheck: { result: { status: "ok" | "error"; latencyMs?: number; error?: string }; expiresAt: number } | null = null;

const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ENCRYPTION_KEY",
];

function checkEnvironment(): { status: "ok" | "warning" | "error"; missing?: string[] } {
  const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) return { status: "error", missing };
  return { status: "ok" };
}

async function checkDatabase(): Promise<{ status: "ok" | "error"; latencyMs?: number; error?: string }> {
  const now = Date.now();
  if (cachedDbCheck && now < cachedDbCheck.expiresAt) {
    return cachedDbCheck.result;
  }

  const startMs = now;
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("tenants").select("id").limit(1);
    const latencyMs = Date.now() - startMs;
    const result = error
      ? { status: "error" as const, latencyMs, error: error.message }
      : { status: "ok" as const, latencyMs };
    cachedDbCheck = { result, expiresAt: Date.now() + 30_000 };
    return result;
  } catch (err) {
    const result = { status: "error" as const, latencyMs: Date.now() - startMs, error: String(err) };
    cachedDbCheck = { result, expiresAt: Date.now() + 30_000 };
    return result;
  }
}

export async function GET() {
  const [dbCheck, envCheck] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkEnvironment()),
  ]);

  const status: "healthy" | "degraded" | "unhealthy" =
    dbCheck.status === "error" || envCheck.status === "error"
      ? "unhealthy"
      : envCheck.status === "warning"
        ? "degraded"
        : "healthy";

  const health: HealthCheck = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: { database: dbCheck, environment: envCheck },
  };

  return NextResponse.json(health, { status: status === "unhealthy" ? 503 : 200 });
}

// HEAD used by load balancers — no DB query needed, just confirm the process is alive
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
