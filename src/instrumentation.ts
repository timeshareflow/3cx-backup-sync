/**
 * Next.js Instrumentation
 *
 * This file runs once when the server starts up.
 * It's used to validate environment variables and perform other startup tasks.
 */

export async function register() {
  // Only run on the server (not during build or on edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateAndLogEnvironment } = await import("@/lib/env-validation");
    validateAndLogEnvironment();
  }
}
