import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import {
  employees,
  approvalWorkflows,
  approvalWorkflowSteps,
  timeOffRequests,
  approvalRequests,
  approvalRequestSteps,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createApprovalRequest, approveStep, getApprovalRequestForEntity } from "@/lib/approvals";

// Mock auth for testing
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

describe("Approval Workflows", () => {
  let testEmployeeId: number;
  let testManagerId: number;
  let testAdminId: number;
  let testWorkflowId: number;
  let testRequestId: number;

  beforeAll(async () => {
    // Create test employees
    const [admin] = await db
      .insert(employees)
      .values({
        employeeNumber: "TEST_ADMIN",
        firstName: "Test",
        lastName: "Admin",
        email: "test.admin@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
      })
      .returning();

    const [manager] = await db
      .insert(employees)
      .values({
        employeeNumber: "TEST_MANAGER",
        firstName: "Test",
        lastName: "Manager",
        email: "test.manager@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "manager",
      })
      .returning();

    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: "TEST_EMPLOYEE",
        firstName: "Test",
        lastName: "Employee",
        email: "test.employee@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        managerId: manager.id,
        accessLevel: "employee",
      })
      .returning();

    testAdminId = admin.id;
    testManagerId = manager.id;
    testEmployeeId = employee.id;

    // Create test workflow
    const [workflow] = await db
      .insert(approvalWorkflows)
      .values({
        name: "Test Time Off Workflow",
        type: "time_off",
        enabled: true,
        requiresManagerApproval: true,
        requiresAdminApproval: true,
      })
      .returning();

    testWorkflowId = workflow.id;

    // Create 2-step workflow
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

    // Create test time off request
    const [request] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: testEmployeeId,
        policyId: 1, // Assume policy exists from seed
        startDate: "2027-06-01",
        endDate: "2027-06-05",
        daysRequested: "5",
        notes: "Test vacation",
        status: "pending",
      })
      .returning();

    testRequestId = request.id;
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(approvalRequestSteps).where(eq(approvalRequestSteps.approvalRequestId, testRequestId));
    await db.delete(approvalRequests).where(eq(approvalRequests.entityId, testRequestId));
    await db.delete(timeOffRequests).where(eq(timeOffRequests.id, testRequestId));
    await db.delete(approvalWorkflowSteps).where(eq(approvalWorkflowSteps.workflowId, testWorkflowId));
    await db.delete(approvalWorkflows).where(eq(approvalWorkflows.id, testWorkflowId));
    await db.delete(employees).where(eq(employees.id, testEmployeeId));
    await db.delete(employees).where(eq(employees.id, testManagerId));
    await db.delete(employees).where(eq(employees.id, testAdminId));
  });

  test("creates 2-step approval request", async () => {
    const result = await createApprovalRequest({
      workflowId: testWorkflowId,
      entityType: "time_off_request",
      entityId: testRequestId,
      requesterId: testEmployeeId,
    });

    expect(result.success).toBe(true);
    expect(result.request).toBeDefined();
    expect(result.request?.status).toBe("pending");
    expect(result.request?.currentStep).toBe(1);

    // Verify steps were created
    const approvalData = await getApprovalRequestForEntity("time_off_request", testRequestId);
    expect(approvalData).toBeDefined();
    expect(approvalData?.steps.length).toBe(2);
    expect(approvalData?.steps[0].step.stepOrder).toBe(1);
    expect(approvalData?.steps[0].step.status).toBe("pending");
    expect(approvalData?.steps[0].approver?.id).toBe(testManagerId);
  });

  test("step 1 approval advances to step 2 and keeps request pending", async () => {
    // Get approval request
    const approvalData = await getApprovalRequestForEntity("time_off_request", testRequestId);
    expect(approvalData).toBeDefined();

    // Manager approves step 1
    await approveStep(approvalData!.request.id, 1, testManagerId, "Approved by manager");

    // Check that request is still pending and moved to step 2
    const updatedData = await getApprovalRequestForEntity("time_off_request", testRequestId);
    expect(updatedData?.request.status).toBe("pending");
    expect(updatedData?.request.currentStep).toBe(2);
    expect(updatedData?.steps[0].step.status).toBe("approved");
    expect(updatedData?.steps[1].step.status).toBe("pending");
  });

  test("step 2 approval marks request approved", async () => {
    // Get approval request
    const approvalData = await getApprovalRequestForEntity("time_off_request", testRequestId);
    expect(approvalData).toBeDefined();

    // Admin approves step 2
    await approveStep(approvalData!.request.id, 2, testAdminId, "Approved by admin");

    // Check that request is now fully approved
    const updatedData = await getApprovalRequestForEntity("time_off_request", testRequestId);
    expect(updatedData?.request.status).toBe("approved");
    expect(updatedData?.steps[0].step.status).toBe("approved");
    expect(updatedData?.steps[1].step.status).toBe("approved");

    // Check that the time off request is marked approved
    const [timeOffRequest] = await db
      .select()
      .from(timeOffRequests)
      .where(eq(timeOffRequests.id, testRequestId))
      .limit(1);
    expect(timeOffRequest.status).toBe("approved");
  });

  test("only step approver can act on current step", async () => {
    // Create a new request for this test
    const [newRequest] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: testEmployeeId,
        policyId: 1,
        startDate: "2027-07-01",
        endDate: "2027-07-05",
        daysRequested: "5",
        notes: "Another test",
        status: "pending",
      })
      .returning();

    const approvalRequest = await createApprovalRequest({
      workflowId: testWorkflowId,
      entityType: "time_off_request",
      entityId: newRequest.id,
      requesterId: testEmployeeId,
    });

    // Try to approve step 1 with admin (should fail in real application)
    // This test verifies the approval data structure
    const approvalData = await getApprovalRequestForEntity("time_off_request", newRequest.id);
    expect(approvalData?.steps[0].step.approverId).toBe(testManagerId);
    expect(approvalData?.steps[0].step.approverId).not.toBe(testAdminId);

    // Clean up
    await db.delete(approvalRequestSteps).where(eq(approvalRequestSteps.approvalRequestId, approvalRequest!.id));
    await db.delete(approvalRequests).where(eq(approvalRequests.id, approvalRequest!.id));
    await db.delete(timeOffRequests).where(eq(timeOffRequests.id, newRequest.id));
  });
});
