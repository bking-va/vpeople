import { describe, test, expect } from "vitest";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

describe("Audit Redaction", () => {
  test("redacts sensitive compensation fields at write time", async () => {
    // Create a test user for audit
    const [testUser] = await db
      .insert(users)
      .values({
        id: "test-audit-user",
        name: "Test User",
        email: "test.audit@test.com",
      })
      .onConflictDoNothing()
      .returning();

    await createAuditLog({
      userId: testUser.id,
      action: "compensation_updated",
      entityType: "employee",
      entityId: "999",
      changes: {
        payRate: "100000",
        payType: "salary",
        bonus: "20000",
        equity: "5000",
        normalField: "visible",
      },
    });

    // Fetch the audit log
    const [log] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, testUser.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    expect(log).toBeDefined();
    const changes = log.changes as any;

    // Sensitive fields should be redacted
    expect(changes.payRate).toBe("[REDACTED]");
    expect(changes.payType).toBe("[REDACTED]");
    expect(changes.bonus).toBe("[REDACTED]");
    expect(changes.equity).toBe("[REDACTED]");

    // Normal fields should not be redacted
    expect(changes.normalField).toBe("visible");

    // Clean up
    await db.delete(auditLogs).where(eq(auditLogs.id, log.id));
    await db.delete(users).where(eq(users.id, testUser.id));
  });

  test("redacts personal identifier fields at write time", async () => {
    const [testUser] = await db
      .insert(users)
      .values({
        id: "test-audit-user-2",
        name: "Test User 2",
        email: "test.audit2@test.com",
      })
      .onConflictDoNothing()
      .returning();

    await createAuditLog({
      userId: testUser.id,
      action: "employee_updated",
      entityType: "employee",
      entityId: "999",
      changes: {
        sin: "123-456-789",
        ssn: "987-65-4321",
        passport: "A12345678",
        email: "employee@test.com",
        firstName: "John",
      },
    });

    const [log] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, testUser.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    expect(log).toBeDefined();
    const changes = log.changes as any;

    // Sensitive fields should be redacted
    expect(changes.sin).toBe("[REDACTED]");
    expect(changes.ssn).toBe("[REDACTED]");
    expect(changes.passport).toBe("[REDACTED]");

    // Normal fields should not be redacted
    expect(changes.email).toBe("employee@test.com");
    expect(changes.firstName).toBe("John");

    // Clean up
    await db.delete(auditLogs).where(eq(auditLogs.id, log.id));
    await db.delete(users).where(eq(users.id, testUser.id));
  });

  test("redacts banking fields at write time", async () => {
    const [testUser] = await db
      .insert(users)
      .values({
        id: "test-audit-user-3",
        name: "Test User 3",
        email: "test.audit3@test.com",
      })
      .onConflictDoNothing()
      .returning();

    await createAuditLog({
      userId: testUser.id,
      action: "banking_updated",
      entityType: "employee",
      entityId: "999",
      changes: {
        bankAccount: "123456789",
        bankAccountNumber: "987654321",
        routingNumber: "123456789",
        iban: "GB82WEST12345698765432",
        jobTitle: "Engineer",
      },
    });

    const [log] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, testUser.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    expect(log).toBeDefined();
    const changes = log.changes as any;

    // Banking fields should be redacted
    expect(changes.bankAccount).toBe("[REDACTED]");
    expect(changes.bankAccountNumber).toBe("[REDACTED]");
    expect(changes.routingNumber).toBe("[REDACTED]");
    expect(changes.iban).toBe("[REDACTED]");

    // Normal fields should not be redacted
    expect(changes.jobTitle).toBe("Engineer");

    // Clean up
    await db.delete(auditLogs).where(eq(auditLogs.id, log.id));
    await db.delete(users).where(eq(users.id, testUser.id));
  });

  test("does not redact non-sensitive fields", async () => {
    const [testUser] = await db
      .insert(users)
      .values({
        id: "test-audit-user-4",
        name: "Test User 4",
        email: "test.audit4@test.com",
      })
      .onConflictDoNothing()
      .returning();

    await createAuditLog({
      userId: testUser.id,
      action: "employee_updated",
      entityType: "employee",
      entityId: "999",
      changes: {
        firstName: "Jane",
        lastName: "Doe",
        jobTitle: "Senior Engineer",
        department: "Engineering",
        location: "Toronto",
      },
    });

    const [log] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, testUser.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    expect(log).toBeDefined();
    const changes = log.changes as any;

    // All fields should be visible
    expect(changes.firstName).toBe("Jane");
    expect(changes.lastName).toBe("Doe");
    expect(changes.jobTitle).toBe("Senior Engineer");
    expect(changes.department).toBe("Engineering");
    expect(changes.location).toBe("Toronto");

    // Clean up
    await db.delete(auditLogs).where(eq(auditLogs.id, log.id));
    await db.delete(users).where(eq(users.id, testUser.id));
  });
});
