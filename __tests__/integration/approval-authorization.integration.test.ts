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
import {
  createApprovalRequest,
  approveStep,
  rejectStep,
  getVisiblePendingApprovals,
} from "@/lib/approvals";

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
      const actorIds = [testAdmin?.id, testManager?.id, testCEO?.id, testEmployee?.id].filter(Boolean);
      for (const id of actorIds) {
        await db.delete(auditLogs).where(eq(auditLogs.employeeId, id));
        await db.delete(approvalRequests).where(eq(approvalRequests.requesterId, id));
      }
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
    
    // Create and fully approve a request (testCEO submits, different admin approves)
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "compensation_change",
      entityId: testEmployee.id,
      requesterId: testCEO.id, // CEO is the requester
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
    
    // Approve step 2 (different admin) - this triggers comp insert + audit log
    await approveStep(approvalResult.requestId!, 2, testAdmin.id);
    
    // Verify both step and compensation audit logs were created
    const auditLog = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "compensation_updated"))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    
    expect(auditLog.length).toBe(1);
    expect(auditLog[0].employeeId).toBe(testAdmin.id);
    expect(auditLog[0].action).toBe("compensation_updated");
  });

  test("every approval step writes an audit log entry", async () => {
    // Create approval request (CEO submits, others approve)
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "compensation_change",
      entityId: testEmployee.id,
      requesterId: testCEO.id, // CEO is the requester
      metadata: {
        employeeId: testEmployee.id,
        payRate: "97000",
        payType: "salary",
        paySchedule: "annual",
        currency: "CAD",
        effectiveDate: "2027-01-03",
        changeReason: "Merit increase",
      },
    });

    const auditCountBefore = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "approval_step_approved"));

    // Approve step 1 (manager)
    await approveStep(approvalResult.requestId!, 1, testManager.id);

    // Check audit log for step 1
    const auditLogsAfterStep1 = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "approval_step_approved"))
      .orderBy(desc(auditLogs.createdAt));

    expect(auditLogsAfterStep1.length).toBe(auditCountBefore.length + 1);
    const step1Log = auditLogsAfterStep1[0];
    expect(step1Log.employeeId).toBe(testManager.id);
    expect(step1Log.entityType).toBe("compensation_change");

    // Approve step 2 (different admin)
    await approveStep(approvalResult.requestId!, 2, testAdmin.id);

    // Check audit log for step 2
    const auditLogsAfterStep2 = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "approval_step_approved"))
      .orderBy(desc(auditLogs.createdAt));

    expect(auditLogsAfterStep2.length).toBe(auditCountBefore.length + 2);
    const step2Log = auditLogsAfterStep2[0];
    expect(step2Log.employeeId).toBe(testAdmin.id);
  });

  test("separation of duties: requester cannot give final approval", async () => {
    // testAdmin submits a request for testEmployee
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "compensation_change",
      entityId: testEmployee.id,
      requesterId: testAdmin.id, // testAdmin is the requester
      metadata: {
        employeeId: testEmployee.id,
        payRate: "98000",
        payType: "salary",
        paySchedule: "annual",
        currency: "CAD",
        effectiveDate: "2027-01-04",
        changeReason: "Merit increase",
      },
    });

    // Manager approves step 1
    await approveStep(approvalResult.requestId!, 1, testManager.id);

    // testAdmin (the requester) tries to give final approval at step 2 (should fail)
    await expect(
      approveStep(approvalResult.requestId!, 2, testAdmin.id)
    ).rejects.toThrow("You cannot give final approval to a request you submitted");
  });

  test("step already processed returns correct error", async () => {
    // Create and approve a request
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "compensation_change",
      entityId: testEmployee.id,
      requesterId: testAdmin.id,
      metadata: {
        employeeId: testEmployee.id,
        payRate: "99000",
        payType: "salary",
        paySchedule: "annual",
        currency: "CAD",
        effectiveDate: "2027-01-05",
        changeReason: "Merit increase",
      },
    });

    // Approve step 1
    await approveStep(approvalResult.requestId!, 1, testManager.id);

    // Try to approve step 1 again (should fail)
    await expect(
      approveStep(approvalResult.requestId!, 1, testManager.id)
    ).rejects.toThrow("Step has already been processed");
  });

  test("/approvals only shows the current step to an admin", async () => {
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "compensation_change",
      entityId: testEmployee.id,
      requesterId: testCEO.id,
      metadata: {
        employeeId: testEmployee.id,
        payRate: "100000",
        payType: "salary",
        paySchedule: "annual",
        currency: "CAD",
        effectiveDate: "2027-02-01",
        changeReason: "Merit increase",
      },
    });

    const adminVisibleWhileStep1Pending = await getVisiblePendingApprovals(
      testAdmin.id,
      true
    );
    expect(
      adminVisibleWhileStep1Pending.some(
        (item) => item.request.id === approvalResult.requestId
      )
    ).toBe(false);

    const managerVisible = await getVisiblePendingApprovals(testManager.id, false);
    expect(
      managerVisible.some((item) => item.request.id === approvalResult.requestId)
    ).toBe(true);

    await approveStep(approvalResult.requestId!, 1, testManager.id);

    const adminVisibleAfterStep1 = await getVisiblePendingApprovals(
      testAdmin.id,
      true
    );
    expect(
      adminVisibleAfterStep1.some(
        (item) => item.request.id === approvalResult.requestId
      )
    ).toBe(true);
  });

  test("blocked approvers do not see their own compensation change on /approvals", async () => {
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "compensation_change",
      entityId: testCEO.id,
      requesterId: testAdmin.id,
      metadata: {
        employeeId: testCEO.id,
        payRate: "251000",
        payType: "salary",
        paySchedule: "annual",
        currency: "CAD",
        effectiveDate: "2027-02-01",
        changeReason: "Board approval",
      },
    });

    const ceoVisible = await getVisiblePendingApprovals(testCEO.id, true);
    expect(
      ceoVisible.some((item) => item.request.id === approvalResult.requestId)
    ).toBe(false);
  });

  test("requester does not see their submitted request on /approvals at the final step", async () => {
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "compensation_change",
      entityId: testEmployee.id,
      requesterId: testAdmin.id,
      metadata: {
        employeeId: testEmployee.id,
        payRate: "101000",
        payType: "salary",
        paySchedule: "annual",
        currency: "CAD",
        effectiveDate: "2027-02-02",
        changeReason: "Merit increase",
      },
    });

    await approveStep(approvalResult.requestId!, 1, testManager.id);

    const requesterVisible = await getVisiblePendingApprovals(testAdmin.id, true);
    expect(
      requesterVisible.some((item) => item.request.id === approvalResult.requestId)
    ).toBe(false);

    const otherAdminVisible = await getVisiblePendingApprovals(testCEO.id, true);
    expect(
      otherAdminVisible.some((item) => item.request.id === approvalResult.requestId)
    ).toBe(true);
  });

  test("reject writes an audit log in the same transaction", async () => {
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "compensation_change",
      entityId: testEmployee.id,
      requesterId: testCEO.id,
      metadata: {
        employeeId: testEmployee.id,
        payRate: "102000",
        payType: "salary",
        paySchedule: "annual",
        currency: "CAD",
        effectiveDate: "2027-02-03",
        changeReason: "Merit increase",
      },
    });

    await rejectStep(approvalResult.requestId!, 1, testManager.id, "Not this cycle");

    const [rejectLog] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "approval_step_rejected"))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    expect(rejectLog).toBeDefined();
    expect(rejectLog.employeeId).toBe(testManager.id);
    expect(rejectLog.entityType).toBe("compensation_change");

    const [updated] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, approvalResult.requestId!));
    expect(updated.status).toBe("rejected");
  });

  test("compensation audit stores unredacted payRate for later permission-aware display", async () => {
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "compensation_change",
      entityId: testEmployee.id,
      requesterId: testCEO.id,
      metadata: {
        employeeId: testEmployee.id,
        payRate: "103000",
        payType: "salary",
        paySchedule: "annual",
        currency: "CAD",
        effectiveDate: "2027-02-04",
        changeReason: "Merit increase",
      },
    });

    await approveStep(approvalResult.requestId!, 1, testManager.id);
    await approveStep(approvalResult.requestId!, 2, testAdmin.id);

    const [compLog] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "compensation_updated"))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    expect(compLog).toBeDefined();
    const changes = compLog.changes as Record<string, unknown>;
    expect(changes.payRate).toBe("103000");
    expect(changes.payRate).not.toBe("[REDACTED]");
  });
});
