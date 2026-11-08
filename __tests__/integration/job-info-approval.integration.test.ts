/**
 * Integration tests for job info change approval with REAL Postgres
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  employees,
  departments,
  jobHistory,
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
    departments,
    jobHistory,
    approvalWorkflows,
    approvalWorkflowSteps,
    approvalRequests,
    approvalRequestSteps,
  },
});

describe("Job Info Change Approval Integration Tests (Real Postgres)", () => {
  let testDept: any;
  let testManager: any;
  let testAdmin: any;
  let testEmployee: any;
  let testWorkflow: any;

  beforeAll(async () => {
    const testRunId = Date.now();
    
    // Create test department
    const [dept] = await db
      .insert(departments)
      .values({
        name: `Job Test Dept ${testRunId}`,
        code: `JOB_TEST_${testRunId}`,
      })
      .returning();
    testDept = dept;

    // Create test admin
    const [admin] = await db
      .insert(employees)
      .values({
        employeeNumber: `JOB_ADMIN_${testRunId}`,
        firstName: "Job",
        lastName: "Admin",
        email: `job.admin.${testRunId}@test.com`,
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
        employeeNumber: `JOB_MANAGER_${testRunId}`,
        firstName: "Job",
        lastName: "Manager",
        email: `job.manager.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        departmentId: testDept.id,
      })
      .returning();
    testManager = manager;

    // Create test employee
    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: `JOB_EMPLOYEE_${testRunId}`,
        firstName: "Job",
        lastName: "Employee",
        email: `job.employee.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        managerId: manager.id,
        departmentId: testDept.id,
        jobTitle: "Junior Developer",
      })
      .returning();
    testEmployee = employee;

    // Create 2-step workflow
    const [workflow] = await db
      .insert(approvalWorkflows)
      .values({
        name: `Job Info Test Workflow ${testRunId}`,
        type: "job_info_change",
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
    try {
      if (testAdmin?.id) await db.delete(auditLogs).where(eq(auditLogs.employeeId, testAdmin.id));
      if (testEmployee?.id) await db.delete(jobHistory).where(eq(jobHistory.employeeId, testEmployee.id));
      if (testAdmin?.id) await db.delete(approvalRequests).where(eq(approvalRequests.requesterId, testAdmin.id));
      if (testWorkflow?.id) {
        await db.delete(approvalWorkflowSteps).where(eq(approvalWorkflowSteps.workflowId, testWorkflow.id));
        await db.delete(approvalWorkflows).where(eq(approvalWorkflows.id, testWorkflow.id));
      }
      if (testEmployee?.id) await db.delete(employees).where(eq(employees.id, testEmployee.id));
      if (testManager?.id) await db.delete(employees).where(eq(employees.id, testManager.id));
      if (testAdmin?.id) await db.delete(employees).where(eq(employees.id, testAdmin.id));
      if (testDept?.id) await db.delete(departments).where(eq(departments.id, testDept.id));
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("job info change applies to employee and creates job_history on final approval", async () => {
    const originalJobTitle = testEmployee.jobTitle;

    // Create approval request for job title change
    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "job_info_change",
      entityId: testEmployee.id,
      requesterId: testAdmin.id,
      metadata: {
        employeeId: testEmployee.id,
        jobTitle: "Senior Developer",
        effectiveDate: "2027-01-01",
        changeReason: "Promotion",
      },
    });

    expect(approvalResult.success).toBe(true);

    // Verify employee record NOT updated yet
    const [empBefore] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, testEmployee.id));
    expect(empBefore.jobTitle).toBe(originalJobTitle);

    // Verify no job history yet
    const historyBefore = await db
      .select()
      .from(jobHistory)
      .where(eq(jobHistory.employeeId, testEmployee.id));
    expect(historyBefore.length).toBe(0);

    // Step 1: Manager approval
    await approveStep(approvalResult.requestId!, 1, testManager.id);

    // Still not updated
    const [empAfterStep1] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, testEmployee.id));
    expect(empAfterStep1.jobTitle).toBe(originalJobTitle);

    // Step 2: Admin approval (final)
    await approveStep(approvalResult.requestId!, 2, testAdmin.id);

    // Now employee record should be updated
    const [empFinal] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, testEmployee.id));
    expect(empFinal.jobTitle).toBe("Senior Developer");

    // And job history created
    const [history] = await db
      .select()
      .from(jobHistory)
      .where(eq(jobHistory.employeeId, testEmployee.id))
      .orderBy(desc(jobHistory.effectiveDate));

    expect(history).toBeDefined();
    expect(history.jobTitle).toBe("Senior Developer");
    expect(history.effectiveDate).toBe("2027-01-01");
    expect(history.comment).toBe("Promotion");
  });
});
