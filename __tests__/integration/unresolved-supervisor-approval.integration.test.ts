/**
 * Reassignment to an unavailable supervisor must not skip manager review.
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
import { eq } from "drizzle-orm";
import { createApprovalRequest, approveStep } from "@/lib/approvals";
import { createBambooSyncStore } from "@/lib/bamboo-sync/store";
import type { MappedEmployee } from "@/lib/bamboo-sync/types";

function mappedEmployee(
  overrides: Partial<MappedEmployee> &
    Pick<MappedEmployee, "firstName" | "lastName" | "email">
): MappedEmployee {
  return {
    employeeNumber: null,
    middleName: null,
    preferredName: null,
    personalEmail: null,
    workPhone: null,
    extension: null,
    mobilePhone: null,
    homePhone: null,
    jobTitle: null,
    departmentName: null,
    divisionName: null,
    locationName: null,
    hireDate: "2020-01-01",
    originalHireDate: null,
    terminationDate: null,
    employmentStatus: "full_time",
    accessLevel: "employee",
    gender: null,
    birthDate: null,
    maritalStatus: null,
    nationality: null,
    citizenship: null,
    addressStreet1: null,
    addressStreet2: null,
    addressCity: null,
    addressProvince: null,
    addressPostalCode: null,
    addressCountry: null,
    linkedInUrl: null,
    twitterUrl: null,
    ...overrides,
  };
}

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

describe("Unresolved supervisor leave approval (Real Postgres)", () => {
  let testPolicy: any;
  let testAdmin: any;
  let formerManager: any;
  let testEmployee: any;
  let newSupervisor: any;
  let testWorkflow: any;
  let pendingBambooId: string;
  const extraEmployeeIds: number[] = [];

  beforeAll(async () => {
    const testRunId = Date.now();
    pendingBambooId = `UNRES_SUP_${testRunId}`;

    const [policy] = await db
      .insert(timeOffPolicies)
      .values({
        name: `Unresolved Supervisor Vacation ${testRunId}`,
        policyType: "vacation",
        accrualRate: "10",
        accrualPeriod: "per_year",
        carryoverLimit: "5",
        allowNegativeBalance: false,
      })
      .returning();
    testPolicy = policy;

    const [admin] = await db
      .insert(employees)
      .values({
        employeeNumber: `UNRES_ADMIN_${testRunId}`,
        firstName: "Unresolved",
        lastName: "Admin",
        email: `unresolved.admin.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
      })
      .returning();
    testAdmin = admin;

    const [manager] = await db
      .insert(employees)
      .values({
        employeeNumber: `UNRES_FORMER_${testRunId}`,
        firstName: "Former",
        lastName: "Manager",
        email: `unresolved.former.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        bambooId: `UNRES_FORMER_${testRunId}`,
      })
      .returning();
    formerManager = manager;

    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: `UNRES_EMP_${testRunId}`,
        firstName: "Unresolved",
        lastName: "Employee",
        email: `unresolved.emp.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        managerId: manager.id,
        bambooId: `UNRES_EMP_${testRunId}`,
      })
      .returning();
    testEmployee = employee;

    const [workflow] = await db
      .insert(approvalWorkflows)
      .values({
        name: `Unresolved Supervisor Workflow ${testRunId}`,
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

    await db.insert(timeOffBalances).values({
      employeeId: testEmployee.id,
      policyId: testPolicy.id,
      balance: "25.0",
    });
  });

  afterAll(async () => {
    try {
      const actorIds = [
        testEmployee?.id,
        formerManager?.id,
        testAdmin?.id,
        newSupervisor?.id,
        ...extraEmployeeIds,
      ].filter(Boolean);
      for (const id of actorIds) {
        await db.delete(auditLogs).where(eq(auditLogs.employeeId, id));
        await db.delete(approvalRequests).where(eq(approvalRequests.requesterId, id));
      }
      if (testEmployee?.id) {
        await db.delete(timeOffBalances).where(eq(timeOffBalances.employeeId, testEmployee.id));
        await db.delete(timeOffRequests).where(eq(timeOffRequests.employeeId, testEmployee.id));
      }
      if (testWorkflow?.id) {
        await db
          .delete(approvalWorkflowSteps)
          .where(eq(approvalWorkflowSteps.workflowId, testWorkflow.id));
        await db.delete(approvalWorkflows).where(eq(approvalWorkflows.id, testWorkflow.id));
      }
      for (const id of extraEmployeeIds) {
        await db.delete(timeOffBalances).where(eq(timeOffBalances.employeeId, id));
        await db.delete(timeOffRequests).where(eq(timeOffRequests.employeeId, id));
        await db.delete(employees).where(eq(employees.id, id));
      }
      if (testEmployee?.id) await db.delete(employees).where(eq(employees.id, testEmployee.id));
      if (formerManager?.id) await db.delete(employees).where(eq(employees.id, formerManager.id));
      if (newSupervisor?.id) await db.delete(employees).where(eq(employees.id, newSupervisor.id));
      if (testAdmin?.id) await db.delete(employees).where(eq(employees.id, testAdmin.id));
      if (testPolicy?.id) await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, testPolicy.id));
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("unavailable supervisor, leave submit, then supervisor resolving later", async () => {
    const store = createBambooSyncStore(db);

    await store.setManager(testEmployee.id, null);
    await store.setUnresolvedSupervisor(testEmployee.id, pendingBambooId);

    const [employeeAfterClear] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, testEmployee.id));
    expect(employeeAfterClear.managerId).toBeNull();
    expect(employeeAfterClear.pendingSupervisorBambooId).toBe(pendingBambooId);

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

    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "time_off_request",
      entityId: request.id,
      requesterId: testEmployee.id,
    });
    expect(approvalResult.success).toBe(true);
    const requestId = approvalResult.requestId!;

    const [approval] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, requestId));
    expect(approval.status).toBe("pending");
    expect(approval.currentStep).toBe(1);

    const steps = await db
      .select()
      .from(approvalRequestSteps)
      .where(eq(approvalRequestSteps.approvalRequestId, requestId));
    const managerStep = steps.find((step) => step.stepOrder === 1);
    const adminStep = steps.find((step) => step.stepOrder === 2);
    expect(managerStep?.status).toBe("pending");
    expect(managerStep?.approverId).toBeNull();
    expect(adminStep?.status).toBe("pending");

    await expect(approveStep(requestId, 1, formerManager.id)).rejects.toThrow(
      "You are not authorized to approve this step"
    );

    const [supervisor] = await db
      .insert(employees)
      .values({
        employeeNumber: `UNRES_NEW_${Date.now()}`,
        firstName: "Grace",
        lastName: "Hopper",
        email: `unresolved.grace.${Date.now()}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        bambooId: pendingBambooId,
      })
      .returning();
    newSupervisor = supervisor;

    await store.setManager(testEmployee.id, newSupervisor.id);
    await store.setUnresolvedSupervisor(testEmployee.id, null);

    const [employeeAfterResolve] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, testEmployee.id));
    expect(employeeAfterResolve.managerId).toBe(newSupervisor.id);
    expect(employeeAfterResolve.pendingSupervisorBambooId).toBeNull();

    const [reboundManagerStep] = await db
      .select()
      .from(approvalRequestSteps)
      .where(eq(approvalRequestSteps.approvalRequestId, requestId))
      .then((rows) => rows.filter((step) => step.stepOrder === 1));
    expect(reboundManagerStep.status).toBe("pending");
    expect(reboundManagerStep.approverId).toBe(newSupervisor.id);

    await expect(approveStep(requestId, 1, formerManager.id)).rejects.toThrow(
      "You are not authorized to approve this step"
    );

    await approveStep(requestId, 1, newSupervisor.id);

    const [afterManager] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, requestId));
    expect(afterManager.status).toBe("pending");
    expect(afterManager.currentStep).toBe(2);
  });

  test("full_admin can cover an unresolved manager step without auto-approving leave", async () => {
    const store = createBambooSyncStore(db);
    await store.setManager(testEmployee.id, null);
    await store.setUnresolvedSupervisor(testEmployee.id, pendingBambooId);

    const [request] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: testEmployee.id,
        policyId: testPolicy.id,
        startDate: "2027-08-01",
        endDate: "2027-08-01",
        daysRequested: "1",
        status: "pending",
      })
      .returning();

    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "time_off_request",
      entityId: request.id,
      requesterId: testEmployee.id,
    });
    const requestId = approvalResult.requestId!;

    await approveStep(requestId, 1, testAdmin.id);

    const [afterFallback] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, requestId));
    expect(afterFallback.status).toBe("pending");
    expect(afterFallback.currentStep).toBe(2);

    const [leave] = await db
      .select()
      .from(timeOffRequests)
      .where(eq(timeOffRequests.id, request.id));
    expect(leave.status).toBe("pending");
  });

  test("intentionally managerless employees still auto-approve the manager step", async () => {
    const [ceo] = await db
      .insert(employees)
      .values({
        employeeNumber: `UNRES_CEO_${Date.now()}`,
        firstName: "Unresolved",
        lastName: "CEO",
        email: `unresolved.ceo.${Date.now()}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
        managerId: null,
        pendingSupervisorBambooId: null,
      })
      .returning();

    const [request] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: ceo.id,
        policyId: testPolicy.id,
        startDate: "2027-09-01",
        endDate: "2027-09-01",
        daysRequested: "1",
        status: "pending",
      })
      .returning();

    await db.insert(timeOffBalances).values({
      employeeId: ceo.id,
      policyId: testPolicy.id,
      balance: "10.0",
    });

    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "time_off_request",
      entityId: request.id,
      requesterId: ceo.id,
    });
    const requestId = approvalResult.requestId!;

    const [approval] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, requestId));
    expect(approval.status).toBe("pending");
    expect(approval.currentStep).toBe(2);

    const steps = await db
      .select()
      .from(approvalRequestSteps)
      .where(eq(approvalRequestSteps.approvalRequestId, requestId));
    expect(steps.find((step) => step.stepOrder === 1)?.status).toBe("approved");
    expect(steps.find((step) => step.stepOrder === 2)?.status).toBe("pending");

    await db.delete(auditLogs).where(eq(auditLogs.employeeId, ceo.id));
    await db.delete(approvalRequests).where(eq(approvalRequests.requesterId, ceo.id));
    await db.delete(timeOffRequests).where(eq(timeOffRequests.employeeId, ceo.id));
    await db.delete(timeOffBalances).where(eq(timeOffBalances.employeeId, ceo.id));
    await db.delete(employees).where(eq(employees.id, ceo.id));
  });

  test("imports a new supervisor in the sync transaction while leave is pending", async () => {
    const runId = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const supervisorBambooId = `TX_SUP_${runId}`;

    const [subordinate] = await db
      .insert(employees)
      .values({
        employeeNumber: `TX_EMP_${runId}`,
        firstName: "Transactional",
        lastName: "Report",
        email: `tx.report.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        managerId: formerManager.id,
        bambooId: `TX_EMP_${runId}`,
      })
      .returning();
    extraEmployeeIds.push(subordinate.id);

    await db.insert(timeOffBalances).values({
      employeeId: subordinate.id,
      policyId: testPolicy.id,
      balance: "12.0",
    });

    const store = createBambooSyncStore(db);
    expect(typeof (db as { transaction?: unknown }).transaction).toBe(
      "function"
    );
    expect(typeof store.transaction).toBe("function");

    await store.setManager(subordinate.id, null);
    await store.setUnresolvedSupervisor(subordinate.id, supervisorBambooId);

    const [request] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: subordinate.id,
        policyId: testPolicy.id,
        startDate: "2027-10-01",
        endDate: "2027-10-01",
        daysRequested: "1",
        status: "pending",
      })
      .returning();

    const approvalResult = await createApprovalRequest({
      workflowId: testWorkflow.id,
      entityType: "time_off_request",
      entityId: request.id,
      requesterId: subordinate.id,
    });
    expect(approvalResult.success).toBe(true);
    const requestId = approvalResult.requestId!;

    const [managerStepBefore] = await db
      .select()
      .from(approvalRequestSteps)
      .where(eq(approvalRequestSteps.approvalRequestId, requestId))
      .then((rows) => rows.filter((step) => step.stepOrder === 1));
    expect(managerStepBefore.status).toBe("pending");
    expect(managerStepBefore.approverId).toBeNull();

    await store.transaction!(async (txStore) => {
      const created = await txStore.upsertEmployee(
        supervisorBambooId,
        mappedEmployee({
          firstName: "Imported",
          lastName: "Supervisor",
          email: `tx.supervisor.${runId}@test.com`,
          employeeNumber: `TX_SUP_${runId}`,
        })
      );
      await txStore.setManager(subordinate.id, created.id);
      await txStore.setUnresolvedSupervisor(subordinate.id, null);
    });

    const [imported] = await db
      .select()
      .from(employees)
      .where(eq(employees.bambooId, supervisorBambooId));
    expect(imported).toBeDefined();
    extraEmployeeIds.push(imported.id);

    const [subordinateAfter] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, subordinate.id));
    expect(subordinateAfter.managerId).toBe(imported.id);
    expect(subordinateAfter.pendingSupervisorBambooId).toBeNull();

    const [managerStepAfter] = await db
      .select()
      .from(approvalRequestSteps)
      .where(eq(approvalRequestSteps.approvalRequestId, requestId))
      .then((rows) => rows.filter((step) => step.stepOrder === 1));
    expect(managerStepAfter.status).toBe("pending");
    expect(managerStepAfter.approverId).toBe(imported.id);
  });
});
