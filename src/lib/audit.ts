import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";

export type AuditAction =
  // User actions
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "user.role_changed"
  | "user.impersonated"
  | "user.impersonation_ended"
  // Tenant actions
  | "tenant.created"
  | "tenant.updated"
  | "tenant.deactivated"
  | "tenant.activated"
  // Subscription/billing actions
  | "plan.changed"
  | "payment.succeeded"
  | "payment.failed"
  | "subscription.created"
  | "subscription.cancelled"
  // Settings actions
  | "settings.updated"
  | "smtp.updated"
  | "storage_plan.created"
  | "storage_plan.updated"
  | "storage_plan.deleted"
  // Auth actions
  | "login.success"
  | "login.failed"
  | "password.changed"
  | "password.reset";

export type AuditEntityType =
  | "user"
  | "tenant"
  | "subscription"
  | "billing"
  | "settings"
  | "storage_plan"
  | "auth";

export interface AuditLogParams {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  tenantId?: string | null;
  userId?: string;
  request?: NextRequest;
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit event to the database
 * This function is non-blocking and will not throw errors to avoid disrupting the main flow
 */
export async function logAuditEvent(params: AuditLogParams): Promise<void> {
  try {
    const supabase = createAdminClient();

    // Extract IP and user agent from request if available
    let ipAddress: string | null = null;
    let userAgent: string | null = null;

    if (params.request) {
      // Try various headers for IP address (in order of preference)
      ipAddress =
        params.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        params.request.headers.get("x-real-ip") ||
        params.request.headers.get("cf-connecting-ip") || // Cloudflare
        null;

      userAgent = params.request.headers.get("user-agent");
    }

    // Combine metadata with old/new values if provided
    const auditData = {
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      old_values: params.oldValues || null,
      new_values: params.newValues
        ? { ...params.newValues, ...(params.metadata || {}) }
        : params.metadata || null,
      tenant_id: params.tenantId || null,
      user_id: params.userId || null,
      ip_address: ipAddress,
      user_agent: userAgent,
    };

    const { error } = await supabase.from("audit_logs").insert(auditData);

    if (error) {
      // Log error but don't throw - audit logging should not break the main flow
      console.error("Failed to log audit event:", error.message, {
        action: params.action,
        entityType: params.entityType,
      });
    }
  } catch (error) {
    // Catch any unexpected errors to prevent audit logging from breaking the app
    console.error("Audit logging error:", error);
  }
}

/**
 * Helper to create audit log for user actions
 */
export function logUserAction(
  action: Extract<AuditAction, `user.${string}`>,
  userId: string,
  params: Omit<AuditLogParams, "action" | "entityType" | "entityId">
): Promise<void> {
  return logAuditEvent({
    ...params,
    action,
    entityType: "user",
    entityId: userId,
  });
}

/**
 * Helper to create audit log for tenant actions
 */
export function logTenantAction(
  action: Extract<AuditAction, `tenant.${string}`>,
  tenantId: string,
  params: Omit<AuditLogParams, "action" | "entityType" | "entityId" | "tenantId">
): Promise<void> {
  return logAuditEvent({
    ...params,
    action,
    entityType: "tenant",
    entityId: tenantId,
    tenantId,
  });
}

/**
 * Helper to create audit log for billing/subscription actions
 */
export function logBillingAction(
  action: Extract<AuditAction, `payment.${string}` | `subscription.${string}` | `plan.${string}`>,
  params: Omit<AuditLogParams, "action" | "entityType">
): Promise<void> {
  return logAuditEvent({
    ...params,
    action,
    entityType: "billing",
  });
}

/**
 * Helper to create audit log for settings actions
 */
export function logSettingsAction(
  action: Extract<AuditAction, `settings.${string}` | `smtp.${string}` | `storage_plan.${string}`>,
  params: Omit<AuditLogParams, "action" | "entityType">
): Promise<void> {
  return logAuditEvent({
    ...params,
    action,
    entityType: "settings",
  });
}

/**
 * Helper to create audit log for auth actions
 */
export function logAuthAction(
  action: Extract<AuditAction, `login.${string}` | `password.${string}`>,
  userId: string | undefined,
  params: Omit<AuditLogParams, "action" | "entityType" | "entityId">
): Promise<void> {
  return logAuditEvent({
    ...params,
    action,
    entityType: "auth",
    entityId: userId,
  });
}
