/**
 * Integration tests for compensation change approval with REAL Postgres
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  employees,
  compensationHistory,
  approvalWorkflows,
  approvalWorkflowSteps,
  approvalRequests,
  approvalRequestSteps,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { createApprovalRequest, approveStep } from "@/lib/approvals";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost/vpeople_test",
});

const db = drizzle(pool, {
  schema: {
    employees,
    compensationHistory,
    approvalWorkflows,
    approvalWorkflowSteps,
    approvalRequests,
    approvalRequestSteps,
  },
});

describe("Compensation Change Approval Integration Tests (Real Postgres)", () => {
  let testCEO: any;
  let testManager: any;
  let testAdmin: any;
  let testEmployee: any;
  let testWorkflow: any;

  beforeAll(async () => {
    // Create test CEO (no manager)
    const [ceo] = await db
      .insert(employees)
      .values({
        employeeNumber: "COMP_CEO",
        firstName: "Comp",
        lastName: "CEO",
        email: "comp.ceo@test.com",
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
        employeeNumber: "COMP_ADMIN",
        firstName: "Comp",
        lastName: "Admin",
        email: "comp.admin@test.com",
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
        employeeNumber: "COMP_MANAGER",
        firstName: "Comp",
        lastName: "Manager",
        email: "comp.manager@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    testManager = manager;

    // Create test employee reporting to manager
    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: "COMP_EMPLOYEE",
        firstName: "Comp",
        lastName: "Employee",
        email: "comp.employee@test.com",
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
        name: "Comp Test Workflow",
        type: "compensation_change",
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
  });

  afterAll(async () => {
    // Clean up
    await db
      .delete(compensationHistory)
      .where(eq(compensationHistory.employeeId, testEmployee.id));
    await db
      .delete(compensationHistory)
      .where(eq(compensationHistory.employeeId, testCEO.id));
    await db.delete(approvalRequests).where(eq(approvalRequests.requesterId, testAdmin.id));
    await db
      .delete(approvalWorkflowSteps)
      .where(eq(approvalWorkflowSteps.workflowId, testWorkflow.id));
    await db.delete(approvalWorkflows).where(eq(approvalWorkflows.id, testWorkflow.id));
    await db.delete(employees).where(eq(employees.id, testEmployee.id));
    await db.delete(employees).where(eq(employees.id, testManager.id));
    await db.delete(employees).where(eq(employees.id, testAdmin.id));
    await db.delete(employees).where(eq(employees.id, testCEO.id));

    await pool.end();
  });

  test("comp change routes manager -> full_admin, creates record only on final approval", async () => {
    // Create approval request for employee comp change
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

    // Verify no comp record exists yet
    const compsBefore = await db
      .select()
      .from(compensationHistory)
      .where(eq(compensationHistory.employeeId, testEmployee.id));
    expect(compsBefore.length).toBe(0);

    // Step 1: Manager approval
    const steps = await db
      .select()
      .from(approvalRequestSteps)
      .where(eq(approvalRequestSteps.approvalRequestId, approvalResult.requestId!))
      .orderBy(approvalRequestSteps.stepOrder);

    expect(steps[0].approverId).toBe(testManager.id); // Manager is first approver

    await approveStep(approvalResult.requestId!, 1, testManager.id);

    // Still no comp record after step 1
    const compsAfterStep1 = await db
      .select()
      .from(compensationHistory)
      .where(eq(compensationHistory.employeeId, testEmployee.id));
    expect(compsAfterStep1.length).toBe(0);

    // Step 2: Admin approval
    await approveStep(approvalResult.requestId!, 2, testAdmin.id);

    // Now comp record should exist
    const [finalComp] = await db
      .select()
      .from(compensationHistory)
      .where(eq(compensationHistory.employeeId, testEmployee.id))
      .orderBy(desc(compensationHistory.effectiveDate));

    expect(finalComp).toBeDefined();
    expect(finalComp.payRate).toBe("95000");
    expect(finalComp.payType).toBe("salary");
    expect(finalComp.effectiveDate).toBe("2027-01-01");
  });

  test("CEO comp change skips manager step (auto-approved)", async () => {
    // Create approval request for CEO (no manager)
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
        changeReason: "Annual adjustment",
      },
    });

    expect(approvalResult.success).toBe(true);

    // Check steps - manager step should be auto-approved
    const steps = await db
      .select()
      .from(approvalRequestSteps)
      .where(eq(approvalRequestSteps.approvalRequestId, approvalResult.requestId!))
      .orderBy(approvalRequestSteps.stepOrder);

    expect(steps[0].status).toBe("approved"); // Manager step auto-approved (CEO has no manager)
    expect(steps[1].status).toBe("pending"); // Admin step pending

    // Only need admin approval
    await approveStep(approvalResult.requestId!, 2, testAdmin.id);

    // Verify comp record created
    const [finalComp] = await db
      .select()
      .from(compensationHistory)
      .where(eq(compensationHistory.employeeId, testCEO.id))
      .orderBy(desc(compensationHistory.effectiveDate));

    expect(finalComp).toBeDefined();
    expect(finalComp.payRate).toBe("250000");
  });

  test("wrong approver cannot approve step", async () => {
    // Create another employee
    const [anotherEmployee] = await db
      .insert(employees)
      .values({
        employeeNumber: "COMP_ANOTHER",
        firstName: "Another",
        lastName: "Employee",
        email: "another.employee@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        managerId: testManager.id,
      })
      .returning();

    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "compensation_change",
      entityId: anotherEmployee.id,
      requesterId: testAdmin.id,
      metadata: {
        employeeId: anotherEmployee.id,
        payRate: "85000",
        payType: "salary",
        paySchedule: "annual",
        currency: "CAD",
        effectiveDate: "2027-01-01",
        changeReason: "Test",
      },
    });

    // Try to approve with wrong user (testEmployee instead of testManager)
    await expect(async () => {
      await approveStep(approvalResult.requestId!, 1, testEmployee.id);
    }).rejects.toThrow();

    // Clean up
    await db.delete(employees).where(eq(employees.id, anotherEmployee.id));
  });
});
