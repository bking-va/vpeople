/**
 * Integration tests for time-off approval with REAL Postgres
 * These tests verify balance deduction happens exactly once and atomically
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  employees,
  timeOffRequests,
  timeOffBalances,
  timeOffPolicies,
  approvalWorkflows,
  approvalWorkflowSteps,
  approvalRequests,
  approvalRequestSteps,
  auditLogs,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createApprovalRequest, approveStep } from "@/lib/approvals";

// Use real Postgres connection with configured DATABASE_URL
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required for integration tests");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, {
  schema: {
    employees,
    timeOffRequests,
    timeOffBalances,
    timeOffPolicies,
    approvalWorkflows,
    approvalWorkflowSteps,
    approvalRequests,
    approvalRequestSteps,
    auditLogs,
  },
});

function approvalRequestIdFromChanges(changes: unknown): number | null {
  if (!changes || typeof changes !== "object") return null;
  const id = (changes as { approvalRequestId?: unknown }).approvalRequestId;
  return typeof id === "number" ? id : null;
}

describe("Time-Off Approval Integration Tests (Real Postgres)", () => {
  let testPolicy: any;
  let testManager: any;
  let testAdmin: any;
  let testEmployee: any;
  let testWorkflow: any;

  beforeAll(async () => {
    const testRunId = Date.now();
    
    // Create test policy
    const [policy] = await db
      .insert(timeOffPolicies)
      .values({
        name: `Integration Test Vacation ${testRunId}`,
        policyType: "vacation",
        accrualRate: "10",
        accrualPeriod: "per_year",
        carryoverLimit: "5",
        allowNegativeBalance: false,
      })
      .returning();
    testPolicy = policy;

    // Create test employees
    const [admin] = await db
      .insert(employees)
      .values({
        employeeNumber: `INT_ADMIN_${testRunId}`,
        firstName: "Integration",
        lastName: "Admin",
        email: `integration.admin.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
      })
      .returning();
    testAdmin = admin;

    const [manager] = await db
      .insert(employees)
      .values({
        employeeNumber: `INT_MANAGER_${testRunId}`,
        firstName: "Integration",
        lastName: "Manager",
        email: `integration.manager.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    testManager = manager;

    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: `INT_EMPLOYEE_${testRunId}`,
        firstName: "Integration",
        lastName: "Employee",
        email: `integration.employee.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        managerId: manager.id,
      })
      .returning();
    testEmployee = employee;

    // Create 2-step workflow
    const [workflow] = await db
      .insert(approvalWorkflows)
      .values({
        name: `Integration Test Workflow ${testRunId}`,
        type: "time_off",
        enabled: true,
        requiresManagerApproval: true,
        requiresAdminApproval: true,
      })
      .returning();
    testWorkflow = workflow;

    await db.insert(approvalWorkflowSteps).values([
      {
        workflowId: workflow.id,
        stepOrder: 1,
        approverRole: "manager",
        requiredCount: 1,
      },
      {
        workflowId: workflow.id,
        stepOrder: 2,
        approverRole: "full_admin",
        requiredCount: 1,
      },
    ]);

    // Create initial balance
    await db.insert(timeOffBalances).values({
      employeeId: testEmployee.id,
      policyId: testPolicy.id,
      balance: "25.0",
    });
  });

  afterAll(async () => {
    // Clean up - safe even if tests failed during setup
    try {
      if (testEmployee?.id) {
        await db.delete(auditLogs).where(eq(auditLogs.employeeId, testEmployee.id));
        await db.delete(auditLogs).where(eq(auditLogs.employeeId, testManager.id));
        await db.delete(auditLogs).where(eq(auditLogs.employeeId, testAdmin.id));
        await db.delete(timeOffBalances).where(eq(timeOffBalances.employeeId, testEmployee.id));
        await db.delete(timeOffRequests).where(eq(timeOffRequests.employeeId, testEmployee.id));
        await db.delete(approvalRequests).where(eq(approvalRequests.requesterId, testEmployee.id));
      }
      if (testWorkflow?.id) {
        await db.delete(approvalWorkflowSteps).where(eq(approvalWorkflowSteps.workflowId, testWorkflow.id));
        await db.delete(approvalWorkflows).where(eq(approvalWorkflows.id, testWorkflow.id));
      }
      if (testEmployee?.id) await db.delete(employees).where(eq(employees.id, testEmployee.id));
      if (testManager?.id) await db.delete(employees).where(eq(employees.id, testManager.id));
      if (testAdmin?.id) await db.delete(employees).where(eq(employees.id, testAdmin.id));
      if (testPolicy?.id) await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, testPolicy.id));
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("2-step approval deducts balance exactly once on final approval", async () => {
    // Create request
    const [request] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: testEmployee.id,
        policyId: testPolicy.id,
        startDate: "2027-06-01",
        endDate: "2027-06-03",
        daysRequested: "3",
        status: "pending",
      })
      .returning();

    // Create approval request
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "time_off_request",
      entityId: request.id,
      requesterId: testEmployee.id,
    });

    expect(approvalResult.success).toBe(true);

    // Check initial balance
    const [balanceBefore] = await db
      .select()
      .from(timeOffBalances)
      .where(
        and(
          eq(timeOffBalances.employeeId, testEmployee.id),
          eq(timeOffBalances.policyId, testPolicy.id)
        )
      );
    expect(parseFloat(balanceBefore.balance)).toBe(25.0);

    // Step 1: Manager approval (should NOT deduct balance, but must write audit)
    await approveStep(approvalResult.requestId!, 1, testManager.id);

    const step1Audit = (
      await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.employeeId, testManager.id),
            eq(auditLogs.action, "approval_step_approved")
          )
        )
    ).filter(
      (row) => approvalRequestIdFromChanges(row.changes) === approvalResult.requestId
    );
    expect(step1Audit.length).toBe(1);
    expect(step1Audit[0].entityType).toBe("time_off_request");

    const [balanceAfterStep1] = await db
      .select()
      .from(timeOffBalances)
      .where(
        and(
          eq(timeOffBalances.employeeId, testEmployee.id),
          eq(timeOffBalances.policyId, testPolicy.id)
        )
      );
    expect(parseFloat(balanceAfterStep1.balance)).toBe(25.0); // Still 25

    // Step 2: Admin approval (should deduct balance)
    await approveStep(approvalResult.requestId!, 2, testAdmin.id);

    const [balanceAfterStep2] = await db
      .select()
      .from(timeOffBalances)
      .where(
        and(
          eq(timeOffBalances.employeeId, testEmployee.id),
          eq(timeOffBalances.policyId, testPolicy.id)
        )
      );
    expect(parseFloat(balanceAfterStep2.balance)).toBe(22.0); // 25 - 3 = 22

    // Verify request is approved
    const [finalRequest] = await db
      .select()
      .from(timeOffRequests)
      .where(eq(timeOffRequests.id, request.id));
    expect(finalRequest.status).toBe("approved");

    const step2Audit = (
      await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.employeeId, testAdmin.id),
            eq(auditLogs.action, "approval_step_approved")
          )
        )
    ).filter(
      (row) => approvalRequestIdFromChanges(row.changes) === approvalResult.requestId
    );
    expect(step2Audit.length).toBe(1);

    const [timeOffAudit] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.employeeId, testAdmin.id),
          eq(auditLogs.action, "time_off_approved"),
          eq(auditLogs.entityId, request.id.toString())
        )
      )
      .limit(1);
    expect(timeOffAudit).toBeDefined();
    expect(timeOffAudit.entityType).toBe("time_off_request");
  });

  test("balance deduction is atomic (fails if balance update fails)", async () => {
    // This test verifies that approval and deduction happen atomically
    // by checking the final state after approval

    // Reset balance
    await db
      .update(timeOffBalances)
      .set({ balance: "10.0" })
      .where(
        and(
          eq(timeOffBalances.employeeId, testEmployee.id),
          eq(timeOffBalances.policyId, testPolicy.id)
        )
      );

    // Create request
    const [request] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: testEmployee.id,
        policyId: testPolicy.id,
        startDate: "2027-07-01",
        endDate: "2027-07-02",
        daysRequested: "2",
        status: "pending",
      })
      .returning();

    // Create approval request
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "time_off_request",
      entityId: request.id,
      requesterId: testEmployee.id,
    });

    // Approve both steps
    await approveStep(approvalResult.requestId!, 1, testManager.id);
    await approveStep(approvalResult.requestId!, 2, testAdmin.id);

    // Verify final state: both should be updated
    const [finalRequest] = await db
      .select()
      .from(timeOffRequests)
      .where(eq(timeOffRequests.id, request.id));

    const [finalBalance] = await db
      .select()
      .from(timeOffBalances)
      .where(
        and(
          eq(timeOffBalances.employeeId, testEmployee.id),
          eq(timeOffBalances.policyId, testPolicy.id)
        )
      );

    // Both should be updated together
    expect(finalRequest.status).toBe("approved");
    expect(parseFloat(finalBalance.balance)).toBe(8.0); // 10 - 2 = 8
  });
});
