/**
 * Bamboo-compatible API endpoints against real Postgres.
 */
import { NextRequest } from "next/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import {
  employees,
  jobHistory,
  compensationHistory,
  employmentStatusHistory,
  documents,
  jobOpenings,
  candidates,
  accessLevels,
} from "@/lib/db/schema";
import { GET as whosOut } from "@/app/api/bamboo/v1/time_off/whos_out/route";
import { GET as jobInfo } from "@/app/api/bamboo/v1/tables/jobInfo/route";
import { GET as compensation } from "@/app/api/bamboo/v1/tables/compensation/route";
import { GET as employmentStatus } from "@/app/api/bamboo/v1/tables/employmentStatus/route";
import { GET as files } from "@/app/api/bamboo/v1/files/route";
import { GET as metaFields } from "@/app/api/bamboo/v1/meta/fields/route";
import { GET as metaLists } from "@/app/api/bamboo/v1/meta/lists/route";
import { GET as changed } from "@/app/api/bamboo/v1/employees/changed/route";
import { GET as atsJobs } from "@/app/api/bamboo/v1/applicant_tracking/jobs/route";
import { GET as atsApps } from "@/app/api/bamboo/v1/applicant_tracking/applications/route";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

function authHeader(apiKey: string) {
  return { authorization: `Basic ${Buffer.from(`${apiKey}:x`).toString("base64")}` };
}

describe("Bamboo parity API (Real Postgres)", () => {
  const runId = Date.now();
  const adminKey = `bamboo-parity-admin-${runId}`;
  const empKey = `bamboo-parity-emp-${runId}`;
  let admin: { id: number };
  let employee: { id: number };
  let openingId: number;
  let candidateId: number;

  beforeAll(async () => {
    await db
      .insert(accessLevels)
      .values({
        name: `Bamboo Admin ${runId}`,
        code: "full_admin",
        canViewCompensation: true,
        canEditCompensation: true,
        canViewSensitivePersonalInfo: true,
        canEditSensitivePersonalInfo: true,
        canViewBankInfo: true,
        canEditBankInfo: true,
        canManageUsers: true,
        canManageSettings: true,
        canApproveTimeOff: true,
        canApproveCompensationChanges: true,
      })
      .onConflictDoNothing();

    const [adm] = await db
      .insert(employees)
      .values({
        employeeNumber: `BP_ADM_${runId}`,
        firstName: "Bamboo",
        lastName: "Admin",
        email: `bp.admin.${runId}@vendasta.com`,
        hireDate: "2019-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
        apiKeyHash: crypto.createHash("sha256").update(adminKey).digest("hex"),
        apiKeyCreatedAt: new Date(),
      })
      .returning();
    admin = adm;

    const [emp] = await db
      .insert(employees)
      .values({
        employeeNumber: `BP_EMP_${runId}`,
        firstName: "Bamboo",
        lastName: "Worker",
        email: `bp.emp.${runId}@gmail.com`,
        hireDate: "2021-01-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
        jobTitle: "Designer",
        apiKeyHash: crypto.createHash("sha256").update(empKey).digest("hex"),
        apiKeyCreatedAt: new Date(),
      })
      .returning();
    employee = emp;

    await db.insert(jobHistory).values({
      employeeId: employee.id,
      effectiveDate: "2021-01-01",
      jobTitle: "Designer",
      comment: "Hire",
    });
    await db.insert(compensationHistory).values({
      employeeId: employee.id,
      effectiveDate: "2021-01-01",
      payRate: "90000",
      payType: "salary",
      paySchedule: "annual",
      currency: "CAD",
      changeReason: "New hire",
    });
    await db.insert(employmentStatusHistory).values({
      employeeId: employee.id,
      effectiveDate: "2021-01-01",
      status: "full_time",
      changeType: "hire",
      comment: "Hire",
    });
    await db.insert(documents).values({
      employeeId: employee.id,
      title: "NDA",
      category: "policy",
      status: "signed",
      uploadedBy: admin.id,
    });
    const [opening] = await db
      .insert(jobOpenings)
      .values({
        title: `Parity Role ${runId}`,
        status: "open",
        employmentType: "full_time",
        hiringLeadId: admin.id,
      })
      .returning();
    openingId = opening.id;
    const [candidate] = await db
      .insert(candidates)
      .values({
        jobOpeningId: opening.id,
        firstName: "Pat",
        lastName: "Applicant",
        email: `pat.${runId}@example.com`,
        source: "direct",
        stage: "interview",
      })
      .returning();
    candidateId = candidate.id;
  });

  afterAll(async () => {
    try {
      await db.delete(candidates).where(eq(candidates.id, candidateId));
      await db.delete(jobOpenings).where(eq(jobOpenings.id, openingId));
      await db.delete(documents).where(eq(documents.employeeId, employee.id));
      await db.delete(jobHistory).where(eq(jobHistory.employeeId, employee.id));
      await db.delete(compensationHistory).where(eq(compensationHistory.employeeId, employee.id));
      await db.delete(employmentStatusHistory).where(eq(employmentStatusHistory.employeeId, employee.id));
      await db.delete(employees).where(eq(employees.id, employee.id));
      await db.delete(employees).where(eq(employees.id, admin.id));
    } finally {
      await pool.end();
    }
  });

  test("unauthenticated requests are 401", async () => {
    const req = new NextRequest("http://localhost/api/bamboo/v1/meta/fields");
    expect((await metaFields(req)).status).toBe(401);
  });

  test("admin key can read tables, files, meta, changed, and ATS", async () => {
    const headers = authHeader(adminKey);

    const jobRes = await jobInfo(new NextRequest("http://localhost/api/bamboo/v1/tables/jobInfo", { headers }));
    expect(jobRes.status).toBe(200);
    const jobs = await jobRes.json();
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.some((row: { employeeId: string }) => row.employeeId === String(employee.id))).toBe(true);

    const compRes = await compensation(
      new NextRequest("http://localhost/api/bamboo/v1/tables/compensation", { headers })
    );
    expect(compRes.status).toBe(200);
    const comps = await compRes.json();
    expect(comps.some((row: { employeeId: string; rate: string }) => row.employeeId === String(employee.id) && row.rate)).toBe(true);

    const statusRes = await employmentStatus(
      new NextRequest("http://localhost/api/bamboo/v1/tables/employmentStatus", { headers })
    );
    expect(statusRes.status).toBe(200);
    const statuses = await statusRes.json();
    expect(statuses.some((row: { employeeId: string }) => row.employeeId === String(employee.id))).toBe(true);

    const fileRes = await files(new NextRequest("http://localhost/api/bamboo/v1/files", { headers }));
    expect(fileRes.status).toBe(200);
    const fileBody = await fileRes.json();
    expect(Array.isArray(fileBody.categories)).toBe(true);

    const fieldsRes = await metaFields(new NextRequest("http://localhost/api/bamboo/v1/meta/fields", { headers }));
    expect(fieldsRes.status).toBe(200);
    const fields = await fieldsRes.json();
    expect(fields.some((f: { alias: string }) => f.alias === "firstName")).toBe(true);

    const listsRes = await metaLists(new NextRequest("http://localhost/api/bamboo/v1/meta/lists", { headers }));
    expect(listsRes.status).toBe(200);
    const lists = await listsRes.json();
    expect(lists.some((l: { alias: string }) => l.alias === "employmentStatus")).toBe(true);

    const changedRes = await changed(
      new NextRequest("http://localhost/api/bamboo/v1/employees/changed?since=2000-01-01T00:00:00Z", {
        headers,
      })
    );
    expect(changedRes.status).toBe(200);
    const changedBody = await changedRes.json();
    expect(changedBody.employees[String(employee.id)]).toBeDefined();

    const jobsRes = await atsJobs(
      new NextRequest("http://localhost/api/bamboo/v1/applicant_tracking/jobs", { headers })
    );
    expect(jobsRes.status).toBe(200);
    expect((await jobsRes.json()).jobs.some((j: { id: string }) => j.id === String(openingId))).toBe(true);

    const appsRes = await atsApps(
      new NextRequest("http://localhost/api/bamboo/v1/applicant_tracking/applications", { headers })
    );
    expect(appsRes.status).toBe(200);
    expect((await appsRes.json()).applications.some((a: { id: string }) => a.id === String(candidateId))).toBe(
      true
    );

    const outRes = await whosOut(
      new NextRequest("http://localhost/api/bamboo/v1/time_off/whos_out?start=2020-01-01&end=2020-01-02", {
        headers,
      })
    );
    expect(outRes.status).toBe(200);
    expect(Array.isArray(await outRes.json())).toBe(true);
  });

  test("employee key cannot view compensation table or ATS", async () => {
    const headers = authHeader(empKey);
    expect(
      (await compensation(new NextRequest("http://localhost/api/bamboo/v1/tables/compensation", { headers })))
        .status
    ).toBe(403);
    expect(
      (await atsJobs(new NextRequest("http://localhost/api/bamboo/v1/applicant_tracking/jobs", { headers })))
        .status
    ).toBe(403);
  });
});
