export class SyncError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "SyncError";
  }
}

export class DatabaseConnectionError extends SyncError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "DB_CONNECTION_ERROR", details);
    this.name = "DatabaseConnectionError";
  }
}

export class S3Error extends SyncError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "S3_ERROR", details);
    this.name = "S3Error";
  }
}

export class SupabaseError extends SyncError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "SUPABASE_ERROR", details);
    this.name = "SupabaseError";
  }
}

export function handleError(error: unknown): SyncError {
  if (error instanceof SyncError) {
    return error;
  }

  if (error instanceof Error) {
    return new SyncError(error.message, "UNKNOWN_ERROR", {
      stack: error.stack,
    });
  }

  return new SyncError(String(error), "UNKNOWN_ERROR");
}
