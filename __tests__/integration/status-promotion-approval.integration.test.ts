/**
 * Employment status and promotion workflows against real Postgres.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import {
  employees,
  jobHistory,
  employmentStatusHistory,
  approvalWorkflows,
  approvalWorkflowSteps,
  approvalRequests,
  approvalRequestSteps,
  auditLogs,
} from "@/lib/db/schema";
import { createApprovalRequest, approveStep } from "@/lib/approvals";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

describe("Status and promotion approvals (Real Postgres)", () => {
  const runId = Date.now();
  let manager: { id: number };
  let admin: { id: number };
  let admin2: { id: number };
  let employee: { id: number };
  let statusWorkflow: { id: number };
  let promoWorkflow: { id: number };

  beforeAll(async () => {
    const [mgr] = await db
      .insert(employees)
      .values({
        employeeNumber: `ST_MGR_${runId}`,
        firstName: "Status",
        lastName: "Manager",
        email: `st.mgr.${runId}@test.com`,
        hireDate: "2019-01-01",
        employmentStatus: "full_time",
        accessLevel: "manager",
      })
      .returning();
    manager = mgr;

    const [adm] = await db
      .insert(employees)
      .values({
        employeeNumber: `ST_ADM_${runId}`,
        firstName: "Status",
        lastName: "Admin",
        email: `st.adm.${runId}@test.com`,
        hireDate: "2018-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
      })
      .returning();
    admin = adm;

    const [adm2] = await db
      .insert(employees)
      .values({
        employeeNumber: `ST_ADM2_${runId}`,
        firstName: "Status",
        lastName: "AdminTwo",
        email: `st.adm2.${runId}@test.com`,
        hireDate: "2018-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
      })
      .returning();
    admin2 = adm2;

    const [emp] = await db
      .insert(employees)
      .values({
        employeeNumber: `ST_EMP_${runId}`,
        firstName: "Status",
        lastName: "Employee",
        email: `st.emp.${runId}@test.com`,
        hireDate: "2021-01-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
        jobTitle: "Engineer",
        managerId: manager.id,
      })
      .returning();
    employee = emp;

    const [sw] = await db
      .insert(approvalWorkflows)
      .values({
        name: `Status WF ${runId}`,
        type: "employment_status_change",
        enabled: true,
        requiresManagerApproval: true,
        requiresAdminApproval: true,
      })
      .returning();
    statusWorkflow = sw;
    await db.insert(approvalWorkflowSteps).values([
      { workflowId: sw.id, stepOrder: 1, approverRole: "manager", requiredCount: 1 },
      { workflowId: sw.id, stepOrder: 2, approverRole: "full_admin", requiredCount: 1 },
    ]);

    const [pw] = await db
      .insert(approvalWorkflows)
      .values({
        name: `Promo WF ${runId}`,
        type: "promotion",
        enabled: true,
        requiresManagerApproval: true,
        requiresAdminApproval: true,
      })
      .returning();
    promoWorkflow = pw;
    await db.insert(approvalWorkflowSteps).values([
      { workflowId: pw.id, stepOrder: 1, approverRole: "manager", requiredCount: 1 },
      { workflowId: pw.id, stepOrder: 2, approverRole: "full_admin", requiredCount: 1 },
    ]);
  });

  afterAll(async () => {
    try {
      const requests = await db
        .select({ id: approvalRequests.id })
        .from(approvalRequests)
        .where(eq(approvalRequests.entityId, employee.id));
      for (const request of requests) {
        await db
          .delete(approvalRequestSteps)
          .where(eq(approvalRequestSteps.approvalRequestId, request.id));
      }
      await db.delete(approvalRequests).where(eq(approvalRequests.entityId, employee.id));
      await db.delete(approvalWorkflowSteps).where(eq(approvalWorkflowSteps.workflowId, statusWorkflow.id));
      await db.delete(approvalWorkflowSteps).where(eq(approvalWorkflowSteps.workflowId, promoWorkflow.id));
      await db.delete(approvalWorkflows).where(eq(approvalWorkflows.id, statusWorkflow.id));
      await db.delete(approvalWorkflows).where(eq(approvalWorkflows.id, promoWorkflow.id));
      await db.delete(jobHistory).where(eq(jobHistory.employeeId, employee.id));
      await db.delete(employmentStatusHistory).where(eq(employmentStatusHistory.employeeId, employee.id));
      await db.delete(auditLogs).where(eq(auditLogs.entityId, String(employee.id)));
      await db.delete(employees).where(eq(employees.id, employee.id));
      await db.delete(employees).where(eq(employees.id, manager.id));
      await db.delete(employees).where(eq(employees.id, admin.id));
      await db.delete(employees).where(eq(employees.id, admin2.id));
    } finally {
      await pool.end();
    }
  });

  test("employment status change applies only after final approval", async () => {
    const created = await createApprovalRequest({
      workflowId: statusWorkflow.id,
      entityType: "employment_status_change",
      entityId: employee.id,
      requesterId: admin.id,
      metadata: {
        employeeId: employee.id,
        status: "on_leave",
        effectiveDate: "2026-05-01",
        changeReason: "Parental leave",
      },
    });
    expect(created.success).toBe(true);

    const [before] = await db.select().from(employees).where(eq(employees.id, employee.id));
    expect(before.employmentStatus).toBe("full_time");

    await approveStep(created.requestId!, 1, manager.id);
    const [mid] = await db.select().from(employees).where(eq(employees.id, employee.id));
    expect(mid.employmentStatus).toBe("full_time");

    await expect(approveStep(created.requestId!, 2, admin.id)).rejects.toThrow(/final approval/i);

    await approveStep(created.requestId!, 2, admin2.id);
    const [after] = await db.select().from(employees).where(eq(employees.id, employee.id));
    expect(after.employmentStatus).toBe("on_leave");

    const history = await db
      .select()
      .from(employmentStatusHistory)
      .where(eq(employmentStatusHistory.employeeId, employee.id));
    expect(history.some((row) => row.status === "on_leave" && row.changeType === "status_change")).toBe(true);
  });

  test("promotion writes job history and blocks self-approval", async () => {
    const created = await createApprovalRequest({
      workflowId: promoWorkflow.id,
      entityType: "promotion",
      entityId: employee.id,
      requesterId: admin.id,
      metadata: {
        employeeId: employee.id,
        jobTitle: "Staff Engineer",
        effectiveDate: "2026-07-01",
        employmentStatus: "on_leave",
        changeReason: "Promotion",
      },
    });
    expect(created.success).toBe(true);

    await expect(approveStep(created.requestId!, 1, employee.id)).rejects.toThrow(/your own/i);

    await approveStep(created.requestId!, 1, manager.id);
    await approveStep(created.requestId!, 2, admin2.id);

    const [after] = await db.select().from(employees).where(eq(employees.id, employee.id));
    expect(after.jobTitle).toBe("Staff Engineer");

    const [history] = await db.select().from(jobHistory).where(eq(jobHistory.employeeId, employee.id));
    expect(history.jobTitle).toBe("Staff Engineer");
    expect(history.comment).toBe("Promotion");
  });
});
