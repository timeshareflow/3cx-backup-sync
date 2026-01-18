/**
 * Simple in-memory rate limiter for API protection.
 *
 * For production with multiple instances, consider using Redis or Upstash.
 * This implementation is suitable for single-instance deployments.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store for rate limits (use Redis in production with multiple instances)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
let cleanupTimer: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);

  // Don't prevent process exit
  cleanupTimer.unref();
}

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Identifier for this rate limit (e.g., "api", "auth") */
  identifier?: string;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Check if a request should be rate limited.
 *
 * @param key - Unique identifier for the client (e.g., IP address, user ID)
 * @param config - Rate limit configuration
 * @returns Result indicating if the request is allowed
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  startCleanup();

  const { limit, windowSeconds, identifier = "default" } = config;
  const storeKey = `${identifier}:${key}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  let entry = rateLimitStore.get(storeKey);

  // If no entry or window has expired, create new entry
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 1,
      resetAt: now + windowMs,
    };
    rateLimitStore.set(storeKey, entry);

    return {
      success: true,
      limit,
      remaining: limit - 1,
      resetAt: entry.resetAt,
    };
  }

  // Increment count
  entry.count++;

  // Check if over limit
  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return {
      success: false,
      limit,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter,
    };
  }

  return {
    success: true,
    limit,
    remaining: limit - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Get the client identifier from a request.
 * Uses X-Forwarded-For header if behind a proxy, otherwise falls back to IP.
 */
export function getClientIdentifier(request: Request): string {
  // Try to get the real IP from proxy headers
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Take the first IP in the chain (client IP)
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback to a hash of user-agent for development
  const userAgent = request.headers.get("user-agent") || "unknown";
  return `ua:${userAgent.slice(0, 50)}`;
}

/**
 * Add rate limit headers to a response.
 */
export function addRateLimitHeaders(
  headers: Headers,
  result: RateLimitResult
): void {
  headers.set("X-RateLimit-Limit", result.limit.toString());
  headers.set("X-RateLimit-Remaining", result.remaining.toString());
  headers.set("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000).toString());

  if (result.retryAfter) {
    headers.set("Retry-After", result.retryAfter.toString());
  }
}

// Pre-configured rate limiters for common use cases
export const rateLimitConfigs = {
  // Standard API endpoints: 100 requests per minute
  api: { limit: 100, windowSeconds: 60, identifier: "api" },

  // Search endpoints: 30 requests per minute (more expensive)
  search: { limit: 30, windowSeconds: 60, identifier: "search" },

  // Auth endpoints: 10 requests per minute (prevent brute force)
  auth: { limit: 10, windowSeconds: 60, identifier: "auth" },

  // Export endpoints: 5 requests per minute (very expensive)
  export: { limit: 5, windowSeconds: 60, identifier: "export" },

  // Webhook endpoints: 100 requests per minute
  webhook: { limit: 100, windowSeconds: 60, identifier: "webhook" },

  // Admin endpoints: 50 requests per minute
  admin: { limit: 50, windowSeconds: 60, identifier: "admin" },
} as const;
