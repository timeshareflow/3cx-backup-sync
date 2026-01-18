import { NextResponse } from "next/server";
import {
  checkRateLimit,
  getClientIdentifier,
  addRateLimitHeaders,
  RateLimitConfig,
  rateLimitConfigs,
} from "./rate-limit";

/**
 * Check rate limit and return error response if exceeded.
 * Returns null if request is allowed, or a NextResponse if rate limited.
 */
export function withRateLimit(
  request: Request,
  config: RateLimitConfig = rateLimitConfigs.api
): NextResponse | null {
  const clientId = getClientIdentifier(request);
  const result = checkRateLimit(clientId, config);

  if (!result.success) {
    const response = NextResponse.json(
      {
        error: "Too many requests",
        message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
        retryAfter: result.retryAfter,
      },
      { status: 429 }
    );

    addRateLimitHeaders(response.headers, result);
    return response;
  }

  return null;
}

/**
 * Create a standardized error response.
 */
export function errorResponse(
  message: string,
  status: number = 500,
  details?: Record<string, unknown>
): NextResponse {
  const body: Record<string, unknown> = { error: message };

  if (details) {
    body.details = details;
  }

  return NextResponse.json(body, { status });
}

/**
 * Create a standardized success response.
 */
export function successResponse<T>(
  data: T,
  status: number = 200
): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Safely parse JSON from a request body.
 * Returns parsed data or an error response.
 */
export async function parseJsonBody<T = unknown>(
  request: Request
): Promise<{ data: T } | { error: NextResponse }> {
  try {
    const data = (await request.json()) as T;
    return { data };
  } catch {
    return {
      error: errorResponse("Invalid JSON in request body", 400),
    };
  }
}

/**
 * Validate required fields in a request body.
 * Returns null if valid, or an error response if invalid.
 */
export function validateRequired(
  body: Record<string, unknown>,
  fields: string[]
): NextResponse | null {
  const missing = fields.filter(
    (field) => body[field] === undefined || body[field] === null
  );

  if (missing.length > 0) {
    return errorResponse(`Missing required fields: ${missing.join(", ")}`, 400);
  }

  return null;
}

/**
 * Common HTTP status codes with descriptions.
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Application error class with status code support.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }

  toResponse(): NextResponse {
    return errorResponse(this.message, this.statusCode, {
      code: this.code,
      ...this.details,
    });
  }
}

/**
 * Common API errors factory functions.
 */
export const ApiErrors = {
  badRequest: (message: string, details?: Record<string, unknown>) =>
    new ApiError(message, 400, "BAD_REQUEST", details),

  unauthorized: (message = "Unauthorized") =>
    new ApiError(message, 401, "UNAUTHORIZED"),

  forbidden: (message = "Forbidden") =>
    new ApiError(message, 403, "FORBIDDEN"),

  notFound: (resource = "Resource") =>
    new ApiError(`${resource} not found`, 404, "NOT_FOUND"),

  conflict: (message: string) =>
    new ApiError(message, 409, "CONFLICT"),

  validationError: (errors: string[]) =>
    new ApiError("Validation failed", 422, "VALIDATION_ERROR", { errors }),

  internal: (message = "Internal server error") =>
    new ApiError(message, 500, "INTERNAL_ERROR"),

  serviceUnavailable: (message = "Service temporarily unavailable") =>
    new ApiError(message, 503, "SERVICE_UNAVAILABLE"),
};

/**
 * Classify an unknown error and return appropriate status code.
 * This helps distinguish between client errors (4xx) and server errors (5xx).
 */
export function classifyError(error: unknown): { status: number; message: string; isClientError: boolean } {
  // Already an ApiError
  if (error instanceof ApiError) {
    return {
      status: error.statusCode,
      message: error.message,
      isClientError: error.statusCode >= 400 && error.statusCode < 500,
    };
  }

  // Standard Error with known patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Authentication/Authorization errors (401/403)
    if (message.includes("unauthorized") || message.includes("not authenticated")) {
      return { status: 401, message: "Unauthorized", isClientError: true };
    }
    if (message.includes("forbidden") || message.includes("not allowed") || message.includes("permission denied")) {
      return { status: 403, message: "Forbidden", isClientError: true };
    }

    // Not found errors (404)
    if (message.includes("not found") || message.includes("does not exist")) {
      return { status: 404, message: error.message, isClientError: true };
    }

    // Validation errors (400)
    if (
      message.includes("invalid") ||
      message.includes("required") ||
      message.includes("must be") ||
      message.includes("cannot be")
    ) {
      return { status: 400, message: error.message, isClientError: true };
    }

    // Conflict errors (409)
    if (message.includes("already exists") || message.includes("duplicate") || message.includes("conflict")) {
      return { status: 409, message: error.message, isClientError: true };
    }

    // Database constraint errors (typically Supabase/PostgreSQL)
    if (message.includes("unique constraint") || message.includes("foreign key")) {
      return { status: 409, message: "Resource conflict", isClientError: true };
    }

    // Connection/timeout errors (503)
    if (
      message.includes("timeout") ||
      message.includes("connection refused") ||
      message.includes("econnrefused") ||
      message.includes("network")
    ) {
      return { status: 503, message: "Service temporarily unavailable", isClientError: false };
    }
  }

  // Default to 500 for unknown errors
  return {
    status: 500,
    message: "Internal server error",
    isClientError: false,
  };
}

/**
 * Handle an error and return appropriate response.
 * Use this in catch blocks to ensure consistent error responses.
 */
export function handleApiError(error: unknown, logContext?: string): NextResponse {
  const classified = classifyError(error);

  // Log server errors, but not client errors
  if (!classified.isClientError) {
    console.error(`[API Error]${logContext ? ` ${logContext}:` : ""}`, error);
  }

  return errorResponse(classified.message, classified.status);
}

/**
 * Retry configuration options.
 */
export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryOn?: (error: unknown) => boolean;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryOn: (error) => {
    // By default, retry on network/transient errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("timeout") ||
        message.includes("econnrefused") ||
        message.includes("econnreset") ||
        message.includes("network") ||
        message.includes("temporarily unavailable") ||
        message.includes("service unavailable")
      );
    }
    return false;
  },
};

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter.
 */
function calculateBackoff(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  multiplier: number
): number {
  const exponentialDelay = initialDelayMs * Math.pow(multiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  // Add jitter (±20%) to prevent thundering herd
  const jitter = cappedDelay * 0.2 * (Math.random() * 2 - 1);
  return Math.round(cappedDelay + jitter);
}

/**
 * Execute an async function with exponential backoff retry.
 *
 * @example
 * const result = await withRetry(
 *   () => fetchDataFromApi(),
 *   { maxRetries: 3, initialDelayMs: 1000 }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const shouldRetry = attempt < opts.maxRetries && opts.retryOn(error);

      if (!shouldRetry) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = calculateBackoff(
        attempt,
        opts.initialDelayMs,
        opts.maxDelayMs,
        opts.backoffMultiplier
      );

      console.warn(
        `[Retry] Attempt ${attempt + 1}/${opts.maxRetries} failed, retrying in ${delay}ms:`,
        error instanceof Error ? error.message : "Unknown error"
      );

      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Wrap a database operation with retry logic for transient failures.
 */
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  operationName?: string
): Promise<T> {
  return withRetry(operation, {
    maxRetries: 3,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    retryOn: (error) => {
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        // Retry on connection issues, not on constraint violations
        return (
          message.includes("connection") ||
          message.includes("timeout") ||
          message.includes("temporarily") ||
          message.includes("too many connections")
        );
      }
      return false;
    },
  }).catch((error) => {
    console.error(`[Database] ${operationName || "Operation"} failed after retries:`, error);
    throw error;
  });
}
