import { db } from "./db";
import { auditLogs } from "./db/schema";

export async function createAuditLog({
  userId,
  action,
  entityType,
  entityId,
  changes,
  ipAddress,
  userAgent,
}: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: any;
  ipAddress?: string;
  userAgent?: string;
}) {
  await db.insert(auditLogs).values({
    userId,
    action,
    entityType,
    entityId,
    changes,
    ipAddress,
    userAgent,
  });
}

export type AuditAction =
  | "time_off_approved"
  | "time_off_denied"
  | "time_off_cancelled"
  | "employee_created"
  | "employee_updated"
  | "compensation_updated"
  | "job_info_updated"
  | "emergency_contact_added"
  | "emergency_contact_updated"
  | "emergency_contact_deleted";
