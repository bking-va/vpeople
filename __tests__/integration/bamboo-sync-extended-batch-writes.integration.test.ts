/**
 * Real Postgres coverage for PR A batched Bamboo writes: time-off requests,
 * job openings, education, and visas use VALUES + explicit CASTs and never
 * attach approval workflows.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import {
  approvalRequests,
  employeeEducation,
  employeeVisas,
  employees,
  jobOpenings,
  timeOffPolicies,
  timeOffRequests,
} from "@/lib/db/schema";
import { createBambooSyncStore } from "@/lib/bamboo-sync/store";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL environment variable is required for integration tests"
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, {
  schema: {
    employees,
    timeOffPolicies,
    timeOffRequests,
    jobOpenings,
    employeeEducation,
    employeeVisas,
    approvalRequests,
  },
});

describe("BambooHR extended batched writes (Real Postgres)", () => {
  const runId = Date.now();
  const bambooEmployeeId = `EXT_EMP_${runId}`;
  const requestBambooId = `TOR_${runId}`;
  const jobBambooId = `JOB_${runId}`;
  const educationBambooId = `edu:${runId}`;
  const visaBambooId = `visa:${runId}`;
  let employeeId: number | null = null;
  let policyId: number | null = null;

  afterAll(async () => {
    try {
      if (employeeId) {
        await db.delete(timeOffRequests).where(eq(timeOffRequests.employeeId, employeeId));
        await db.delete(employeeEducation).where(eq(employeeEducation.employeeId, employeeId));
        await db.delete(employeeVisas).where(eq(employeeVisas.employeeId, employeeId));
        await db.delete(jobOpenings).where(eq(jobOpenings.hiringLeadId, employeeId));
        await db.delete(employees).where(eq(employees.id, employeeId));
      }
      if (policyId) {
        await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, policyId));
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("upserts historical time-off/jobs/education/visas via CASTed VALUES and leaves workflow_id null", async () => {
    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: `EX_${runId}`,
        bambooId: bambooEmployeeId,
        firstName: "Extended",
        lastName: "Import",
        email: `extended.import.${runId}@vendasta.com`,
        hireDate: "2020-01-15",
        originalHireDate: "2020-01-15",
        employmentStatus: "full_time",
        accessLevel: "employee",
      })
      .returning();
    employeeId = employee.id;

    const store = createBambooSyncStore(db);
    await store.transaction!(async (tx) => {
      const policies = await tx.upsertTimeOffPoliciesBatch([
        { name: `Extended Vacation ${runId}`, policyType: "vacation", bambooId: `type:${runId}` },
      ]);
      policyId = policies.get(`extended vacation ${runId}`) ?? null;
      expect(policyId).not.toBeNull();

      const renamed = await tx.upsertTimeOffPoliciesBatch([
        {
          name: `Extended Vacation ${runId} Renamed`,
          policyType: "vacation",
          bambooId: `type:${runId}`,
        },
      ]);
      expect(renamed.get(`extended vacation ${runId} renamed`)).toBe(policyId);

      const requestCount = await tx.upsertTimeOffRequestsBatch(
        [
          {
            bambooId: requestBambooId,
            employeeId: employee.id,
            policyId: policyId!,
            startDate: "2024-06-03",
            endDate: "2024-06-04",
            daysRequested: "2.00",
            status: "approved",
            notes: "Historical leave",
            reviewNotes: "ok",
            reviewedAt: "2024-06-01T00:00:00Z",
            createdAt: "2024-06-01T00:00:00Z",
          },
          {
            bambooId: `${requestBambooId}-pending`,
            employeeId: employee.id,
            policyId: policyId!,
            startDate: "2026-12-01",
            endDate: "2026-12-02",
            daysRequested: "2.00",
            status: "pending",
            notes: null,
            reviewNotes: null,
            reviewedAt: null,
            createdAt: "2026-11-01T00:00:00Z",
          },
        ],
        { chunkSize: 50 }
      );
      expect(requestCount).toBe(2);

      const jobCount = await tx.upsertJobOpeningsBatch(
        [
          {
            bambooId: jobBambooId,
            title: "Platform Engineer",
            departmentId: null,
            locationId: null,
            hiringLeadId: employee.id,
            status: "open",
            bambooStatusId: "4",
            bambooStatusLabel: "Open - Engineering",
            employmentType: "full_time",
            description: "Build platforms",
            requirements: null,
            openDate: "2024-01-15",
            closeDate: null,
          },
        ],
        { chunkSize: 50 }
      );
      expect(jobCount).toBe(1);

      const educationCount = await tx.upsertEducationBatch(
        [
          {
            bambooId: educationBambooId,
            employeeId: employee.id,
            institution: "University of Saskatchewan",
            degree: "BSc",
            fieldOfStudy: "Computer Science",
            startDate: "2010-09-01",
            endDate: "2014-05-01",
            notes: null,
          },
        ],
        { chunkSize: 50 }
      );
      expect(educationCount).toBe(1);

      const visaCount = await tx.upsertVisasBatch(
        [
          {
            bambooId: visaBambooId,
            employeeId: employee.id,
            visaType: "TN",
            country: "Canada",
            documentNumber: "TN-1",
            issuedDate: "2020-01-01",
            expiryDate: "2026-01-01",
            status: "active",
          },
        ],
        { chunkSize: 50 }
      );
      expect(visaCount).toBe(1);
    });

    const requests = await db
      .select()
      .from(timeOffRequests)
      .where(eq(timeOffRequests.employeeId, employee.id));
    expect(requests).toHaveLength(2);
    expect(requests.every((row) => row.workflowId == null)).toBe(true);
    const approved = requests.find((row) => row.bambooId === requestBambooId);
    expect(approved?.status).toBe("approved");
    expect(approved?.startDate).toBe("2024-06-03");
    expect(Number(approved?.daysRequested)).toBe(2);
    const pending = requests.find((row) => row.status === "pending");
    expect(pending?.workflowId).toBeNull();

    const matchingPolicies = await db
      .select()
      .from(timeOffPolicies)
      .where(eq(timeOffPolicies.bambooId, `type:${runId}`));
    expect(matchingPolicies).toHaveLength(1);
    expect(matchingPolicies[0]?.id).toBe(policyId);
    expect(matchingPolicies[0]?.name).toBe(`Extended Vacation ${runId} Renamed`);

    const approvals = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.entityType, "time_off_request"));
    expect(
      approvals.filter((row) => requests.some((request) => request.id === row.entityId))
    ).toHaveLength(0);

    await store.upsertTimeOffRequestsBatch(
      [
        {
          bambooId: requestBambooId,
          employeeId: employee.id,
          policyId: policyId!,
          startDate: "2024-06-03",
          endDate: "2024-06-05",
          daysRequested: "3.00",
          status: "approved",
          notes: "Historical leave updated",
          reviewNotes: "ok",
          reviewedAt: "2024-06-01T00:00:00Z",
          createdAt: "2024-06-01T00:00:00Z",
        },
      ],
      { chunkSize: 50 }
    );
    const [updated] = await db
      .select()
      .from(timeOffRequests)
      .where(eq(timeOffRequests.bambooId, requestBambooId));
    expect(updated.endDate).toBe("2024-06-05");
    expect(Number(updated.daysRequested)).toBe(3);
    expect(updated.workflowId).toBeNull();

    const [opening] = await db
      .select()
      .from(jobOpenings)
      .where(eq(jobOpenings.bambooId, jobBambooId));
    expect(opening.title).toBe("Platform Engineer");
    expect(opening.status).toBe("open");
    expect(opening.bambooStatusLabel).toBe("Open - Engineering");
    expect(opening.openDate).toBe("2024-01-15");

    const [education] = await db
      .select()
      .from(employeeEducation)
      .where(eq(employeeEducation.bambooId, educationBambooId));
    expect(education.institution).toBe("University of Saskatchewan");
    expect(education.startDate).toBe("2010-09-01");

    const [visa] = await db
      .select()
      .from(employeeVisas)
      .where(eq(employeeVisas.bambooId, visaBambooId));
    expect(visa.visaType).toBe("TN");
    expect(visa.expiryDate).toBe("2026-01-01");
  });
});
