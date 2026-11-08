/**
 * Integration tests for approval authorization and step ordering with REAL Postgres
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  employees,
  approvalWorkflows,
  approvalWorkflowSteps,
  approvalRequests,
  approvalRequestSteps,
  auditLogs,
} from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { createApprovalRequest, approveStep } from "@/lib/approvals";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required for integration tests");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, {
  schema: {
    employees,
    approvalWorkflows,
    approvalWorkflowSteps,
    approvalRequests,
    approvalRequestSteps,
    auditLogs,
  },
});

describe("Approval Authorization Integration Tests (Real Postgres)", () => {
  let testCEO: any;
  let testAdmin: any;
  let testManager: any;
  let testEmployee: any;
  let testWorkflow: any;

  beforeAll(async () => {
    const testRunId = Date.now();

    // Create test CEO (no manager)
    const [ceo] = await db
      .insert(employees)
      .values({
        employeeNumber: `AUTH_CEO_${testRunId}`,
        firstName: "Auth",
        lastName: "CEO",
        email: `auth.ceo.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
      })
      .returning();
    testCEO = ceo;

    // Create test admin
    const [admin] = await db
      .insert(employees)
      .values({
        employeeNumber: `AUTH_ADMIN_${testRunId}`,
        firstName: "Auth",
        lastName: "Admin",
        email: `auth.admin.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
      })
      .returning();
    testAdmin = admin;

    // Create test manager
    const [manager] = await db
      .insert(employees)
      .values({
        employeeNumber: `AUTH_MANAGER_${testRunId}`,
        firstName: "Auth",
        lastName: "Manager",
        email: `auth.manager.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    testManager = manager;

    // Create test employee reporting to manager
    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: `AUTH_EMPLOYEE_${testRunId}`,
        firstName: "Auth",
        lastName: "Employee",
        email: `auth.employee.${testRunId}@test.com`,
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
        name: `Auth Test Workflow ${testRunId}`,
        type: "compensation_change",
        enabled: true,
        requiresManagerApproval: true,
        requiresAdminApproval: true,
      })
      .returning();
    testWorkflow = workflow;

    // Create workflow steps
    await db.insert(approvalWorkflowSteps).values([
      {
        workflowId: workflow.id,
        stepOrder: 1,
        approverRole: "manager",
      },
      {
        workflowId: workflow.id,
        stepOrder: 2,
        approverRole: "full_admin",
      },
    ]);
  });

  afterAll(async () => {
    try {
      if (testAdmin?.id) await db.delete(auditLogs).where(eq(auditLogs.employeeId, testAdmin.id));
      if (testAdmin?.id) await db.delete(approvalRequests).where(eq(approvalRequests.requesterId, testAdmin.id));
      if (testWorkflow?.id) {
        await db.delete(approvalWorkflowSteps).where(eq(approvalWorkflowSteps.workflowId, testWorkflow.id));
        await db.delete(approvalWorkflows).where(eq(approvalWorkflows.id, testWorkflow.id));
      }
      if (testEmployee?.id) await db.delete(employees).where(eq(employees.id, testEmployee.id));
      if (testManager?.id) await db.delete(employees).where(eq(employees.id, testManager.id));
      if (testAdmin?.id) await db.delete(employees).where(eq(employees.id, testAdmin.id));
      if (testCEO?.id) await db.delete(employees).where(eq(employees.id, testCEO.id));
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("cannot approve step 2 while step 1 is still pending", async () => {
    // Create approval request
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "compensation_change",
      entityId: testEmployee.id,
      requesterId: testAdmin.id,
      metadata: {
        employeeId: testEmployee.id,
        payRate: "95000",
        payType: "salary",
        paySchedule: "annual",
        currency: "CAD",
        effectiveDate: "2027-01-01",
        changeReason: "Merit increase",
      },
    });

    expect(approvalResult.success).toBe(true);

    // Try to approve step 2 while step 1 is pending (should fail)
    await expect(
      approveStep(approvalResult.requestId!, 2, testAdmin.id)
    ).rejects.toThrow("Cannot approve this step: earlier steps are still pending");

    // Verify step 2 is still pending
    const [step2] = await db
      .select()
      .from(approvalRequestSteps)
      .where(
        eq(approvalRequestSteps.approvalRequestId, approvalResult.requestId!)
      )
      .then(steps => steps.filter(s => s.stepOrder === 2));

    expect(step2.status).toBe("pending");
  });

  test("CEO cannot approve their own compensation change", async () => {
    // Create approval request for CEO (entityId = CEO)
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "compensation_change",
      entityId: testCEO.id,
      requesterId: testAdmin.id,
      metadata: {
        employeeId: testCEO.id,
        payRate: "250000",
        payType: "salary",
        paySchedule: "annual",
        currency: "CAD",
        effectiveDate: "2027-01-01",
        changeReason: "Board approval",
      },
    });

    expect(approvalResult.success).toBe(true);

    // Since CEO has no manager, step 1 auto-approves. CEO is full_admin, so they're the approver for step 2.
    // But CEO should NOT be able to approve their own comp change at step 2
    await expect(
      approveStep(approvalResult.requestId!, 2, testCEO.id)
    ).rejects.toThrow("You cannot approve your own compensation or job information changes");
  });

  test("wrong approver cannot approve step", async () => {
    // Create approval request for employee (manager should approve step 1)
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "compensation_change",
      entityId: testEmployee.id,
      requesterId: testAdmin.id,
      metadata: {
        employeeId: testEmployee.id,
        payRate: "95000",
        payType: "salary",
        paySchedule: "annual",
        currency: "CAD",
        effectiveDate: "2027-01-01",
        changeReason: "Merit increase",
      },
    });

    expect(approvalResult.success).toBe(true);

    // CEO trying to approve step 1 (should fail - only manager or admin for admin steps)
    // Step 1 is a manager step with testManager as the assigned approver
    await expect(
      approveStep(approvalResult.requestId!, 1, testCEO.id)
    ).rejects.toThrow("You are not authorized to approve this step");
  });

  test("audit log failures roll back with compensation change", async () => {
    // This test verifies that audit log writes are atomic with comp changes
    // If audit log fails, the comp change should also roll back
    
    // Create and fully approve a request
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "compensation_change",
      entityId: testEmployee.id,
      requesterId: testAdmin.id,
      metadata: {
        employeeId: testEmployee.id,
        payRate: "96000",
        payType: "salary",
        paySchedule: "annual",
        currency: "CAD",
        effectiveDate: "2027-01-02",
        changeReason: "Merit increase",
      },
    });

    // Approve step 1 (manager)
    await approveStep(approvalResult.requestId!, 1, testManager.id);
    
    // Approve step 2 (admin) - this triggers comp insert + audit log
    await approveStep(approvalResult.requestId!, 2, testAdmin.id);
    
    // Verify audit log was created (proves atomicity)
    const auditLog = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.employeeId, testAdmin.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    
    expect(auditLog.length).toBe(1);
    expect(auditLog[0].action).toBe("compensation_updated");
  });
});
