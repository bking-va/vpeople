import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@/lib/db";
import {
  employees,
  timeOffRequests,
  timeOffBalances,
  timeOffPolicies,
  approvalWorkflows,
  approvalWorkflowSteps,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { approveTimeOffRequest } from "@/app/actions/time-off";
import { createApprovalRequest } from "@/lib/approvals";

// Mock auth
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

describe("Time Off Balance Deduction", () => {
  let testEmployeeId: number;
  let testManagerId: number;
  let testAdminId: number;
  let testPolicyId: number;
  let testWorkflowId: number;

  beforeAll(async () => {
    // Create test policy
    const [policy] = await db
      .insert(timeOffPolicies)
      .values({
        name: "Test Vacation",
        policyType: "vacation",
        accrualRate: "10",
        accrualPeriod: "per_year",
        carryoverLimit: "5",
        allowNegativeBalance: false,
      })
      .returning();

    testPolicyId = policy.id;

    // Create test employees
    const [admin] = await db
      .insert(employees)
      .values({
        employeeNumber: "BAL_ADMIN",
        firstName: "Balance",
        lastName: "Admin",
        email: "balance.admin@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
      })
      .returning();

    testAdminId = admin.id;

    const [manager] = await db
      .insert(employees)
      .values({
        employeeNumber: "BAL_MANAGER",
        firstName: "Balance",
        lastName: "Manager",
        email: "balance.manager@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();

    testManagerId = manager.id;

    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: "BAL_EMPLOYEE",
        firstName: "Balance",
        lastName: "Employee",
        email: "balance.employee@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        managerId: manager.id,
      })
      .returning();

    testEmployeeId = employee.id;

    // Create 2-step workflow
    const [workflow] = await db
      .insert(approvalWorkflows)
      .values({
        name: "Balance Test Workflow",
        type: "time_off",
        enabled: true,
        requiresManagerApproval: true,
        requiresAdminApproval: true,
      })
      .returning();

    testWorkflowId = workflow.id;

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
  });

  afterAll(async () => {
    // Clean up
    await db.delete(timeOffBalances).where(eq(timeOffBalances.employeeId, testEmployeeId));
    await db.delete(timeOffRequests).where(eq(timeOffRequests.employeeId, testEmployeeId));
    await db.delete(approvalWorkflowSteps).where(eq(approvalWorkflowSteps.workflowId, testWorkflowId));
    await db.delete(approvalWorkflows).where(eq(approvalWorkflows.id, testWorkflowId));
    await db.delete(employees).where(eq(employees.id, testEmployeeId));
    await db.delete(employees).where(eq(employees.id, testManagerId));
    await db.delete(employees).where(eq(employees.id, testAdminId));
    await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, testPolicyId));
  });

  test("single-step approval deducts balance exactly once", async () => {
    // Create balance
    await db.insert(timeOffBalances).values({
      employeeId: testEmployeeId,
      policyId: testPolicyId,
      balance: "15.0",
    });

    // Create request
    const [request] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: testEmployeeId,
        policyId: testPolicyId,
        startDate: "2027-06-01",
        endDate: "2027-06-05",
        daysRequested: "5",
        status: "pending",
      })
      .returning();

    // Mock manager session
    mockAuth.mockResolvedValue({
      user: {
        id: "manager-user-id",
        employeeId: testManagerId,
        email: "balance.manager@test.com",
        role: "manager",
      },
    });

    // Approve (single-step, no workflow)
    const result = await approveTimeOffRequest(request.id);
    expect(result.success).toBe(true);

    // Check balance
    const [balance] = await db
      .select()
      .from(timeOffBalances)
      .where(
        and(
          eq(timeOffBalances.employeeId, testEmployeeId),
          eq(timeOffBalances.policyId, testPolicyId)
        )
      );

    expect(parseFloat(balance.balance)).toBe(10.0); // 15 - 5 = 10
  });

  test("multi-step approval deducts balance exactly once (on final approval only)", async () => {
    // Reset balance
    await db
      .update(timeOffBalances)
      .set({ balance: "20.0" })
      .where(
        and(
          eq(timeOffBalances.employeeId, testEmployeeId),
          eq(timeOffBalances.policyId, testPolicyId)
        )
      );

    // Create request
    const [request] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: testEmployeeId,
        policyId: testPolicyId,
        startDate: "2027-07-01",
        endDate: "2027-07-08",
        daysRequested: "6",
        status: "pending",
      })
      .returning();

    // Create approval workflow
    await createApprovalRequest({
      workflowId: testWorkflowId,
      entityType: "time_off_request",
      entityId: request.id,
      requesterId: testEmployeeId,
    });

    // Step 1: Manager approval (should NOT deduct balance)
    mockAuth.mockResolvedValue({
      user: {
        id: "manager-user-id",
        employeeId: testManagerId,
        email: "balance.manager@test.com",
        role: "manager",
      },
    });

    const result1 = await approveTimeOffRequest(request.id);
    expect(result1.success).toBe(true);

    // Balance should still be 20
    const [balanceAfterStep1] = await db
      .select()
      .from(timeOffBalances)
      .where(
        and(
          eq(timeOffBalances.employeeId, testEmployeeId),
          eq(timeOffBalances.policyId, testPolicyId)
        )
      );

    expect(parseFloat(balanceAfterStep1.balance)).toBe(20.0);

    // Step 2: Admin approval (should deduct balance)
    mockAuth.mockResolvedValue({
      user: {
        id: "admin-user-id",
        employeeId: testAdminId,
        email: "balance.admin@test.com",
        role: "admin",
      },
    });

    const result2 = await approveTimeOffRequest(request.id);
    expect(result2.success).toBe(true);

    // Balance should now be 14 (20 - 6 = 14)
    const [balanceAfterStep2] = await db
      .select()
      .from(timeOffBalances)
      .where(
        and(
          eq(timeOffBalances.employeeId, testEmployeeId),
          eq(timeOffBalances.policyId, testPolicyId)
        )
      );

    expect(parseFloat(balanceAfterStep2.balance)).toBe(14.0);
  });

  test("balance deduction is atomic (transaction)", async () => {
    // Reset balance
    await db
      .update(timeOffBalances)
      .set({ balance: "12.0" })
      .where(
        and(
          eq(timeOffBalances.employeeId, testEmployeeId),
          eq(timeOffBalances.policyId, testPolicyId)
        )
      );

    // Create request
    const [request] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: testEmployeeId,
        policyId: testPolicyId,
        startDate: "2027-08-01",
        endDate: "2027-08-03",
        daysRequested: "3",
        status: "pending",
      })
      .returning();

    // Mock manager session
    mockAuth.mockResolvedValue({
      user: {
        id: "manager-user-id",
        employeeId: testManagerId,
        email: "balance.manager@test.com",
        role: "manager",
      },
    });

    // Approve
    await approveTimeOffRequest(request.id);

    // Verify final state
    const [finalRequest] = await db
      .select()
      .from(timeOffRequests)
      .where(eq(timeOffRequests.id, request.id));

    const [finalBalance] = await db
      .select()
      .from(timeOffBalances)
      .where(
        and(
          eq(timeOffBalances.employeeId, testEmployeeId),
          eq(timeOffBalances.policyId, testPolicyId)
        )
      );

    // Both should be updated together
    expect(finalRequest.status).toBe("approved");
    expect(parseFloat(finalBalance.balance)).toBe(9.0); // 12 - 3 = 9
  });
});
