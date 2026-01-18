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

// Required environment variables for production
const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ENCRYPTION_KEY",
];

// Optional but recommended for full functionality
const RECOMMENDED_ENV_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
];

function checkEnvironmentVariables(): {
  status: "ok" | "warning" | "error";
  missing?: string[];
  warnings?: string[];
} {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  for (const envVar of RECOMMENDED_ENV_VARS) {
    if (!process.env[envVar]) {
      warnings.push(envVar);
    }
  }

  if (missing.length > 0) {
    return { status: "error", missing };
  }

  if (warnings.length > 0) {
    return { status: "warning", warnings };
  }

  return { status: "ok" };
}

async function checkDatabase(): Promise<{
  status: "ok" | "error";
  latencyMs?: number;
  error?: string;
}> {
  const startMs = Date.now();

  try {
    const supabase = createAdminClient();

    // Simple query to check connectivity
    const { error } = await supabase
      .from("tenants")
      .select("id")
      .limit(1);

    const latencyMs = Date.now() - startMs;

    if (error) {
      return { status: "error", latencyMs, error: error.message };
    }

    return { status: "ok", latencyMs };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - startMs,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// GET /api/health - Health check endpoint
export async function GET() {
  const [dbCheck, envCheck] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkEnvironmentVariables()),
  ]);

  // Determine overall status
  let status: "healthy" | "degraded" | "unhealthy" = "healthy";

  if (dbCheck.status === "error" || envCheck.status === "error") {
    status = "unhealthy";
  } else if (envCheck.status === "warning") {
    status = "degraded";
  }

  const health: HealthCheck = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {
      database: dbCheck,
      environment: envCheck,
    },
  };

  // Return appropriate status code
  const httpStatus = status === "healthy" ? 200 : status === "degraded" ? 200 : 503;

  return NextResponse.json(health, { status: httpStatus });
}

// HEAD /api/health - Simple health probe (for load balancers)
export async function HEAD() {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("tenants")
      .select("id")
      .limit(1);

    if (error) {
      return new NextResponse(null, { status: 503 });
    }

    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
