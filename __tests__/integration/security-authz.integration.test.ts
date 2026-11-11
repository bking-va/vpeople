/**
 * Integration tests for the Vercel Security Review authz fixes.
 * Unauthorized roles must get 403 or redacted payloads against real Postgres.
 */
import { NextRequest } from "next/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, eq, inArray } from "drizzle-orm";
import crypto from "crypto";
import {
  employees,
  timeOffPolicies,
  timeOffBalances,
  timeOffRequests,
  timesheets,
  jobTitles,
  jobOpenings,
  candidates,
  offerLetters,
  customFields,
  customFieldValues,
  trainingCourses,
  trainingCompletions,
  documents,
  rateLimits,
  employeeVisas,
  approvalRequests,
  approvalRequestSteps,
  approvalWorkflows,
  approvalWorkflowSteps,
  auditLogs,
  accessLevels,
} from "@/lib/db/schema";
import { getApprovalRequestForEntity } from "@/lib/approvals";
import { approveTimeOffRequest } from "@/app/actions/time-off";
import { redactVisaDocumentNumber } from "@/lib/authz";
import { checkRateLimit } from "@/lib/rate-limit";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

import { auth } from "@/lib/auth";
import { POST as createTimeOffApi } from "@/app/api/bamboo/v1/time-off/create/route";
import { GET as listTimeOffApi } from "@/app/api/bamboo/v1/time-off/requests/route";
import { POST as approveTimesheet } from "@/app/api/time-tracking/timesheets/[id]/approve/route";
import { POST as createJobTitle } from "@/app/api/settings/job-titles/route";
import { GET as getCandidate, PATCH as patchCandidate } from "@/app/api/hiring/candidates/[id]/route";
import { GET as listPublicCareers } from "@/app/api/careers/openings/route";
import { GET as getPublicCareer } from "@/app/api/careers/openings/[id]/route";
import { POST as addCandidateNote } from "@/app/api/hiring/candidates/[id]/notes/route";
import { GET as getCustomFieldValues } from "@/app/api/custom-fields/values/route";
import { POST as assignTraining } from "@/app/api/training/assignments/route";
import { POST as applyToOpening } from "@/app/api/hiring/candidates/apply/route";
import { GET as cronAccrue } from "@/app/api/cron/accrue-time-off/route";
import { POST as createSessionTimeOff } from "@/app/api/time-off/requests/route";
import { GET as exportReports } from "@/app/api/reports/export/route";
import { GET as bambooDirectory } from "@/app/api/bamboo/v1/employees/directory/route";
import { GET as bambooEmployee } from "@/app/api/bamboo/v1/employees/[id]/route";
import { GET as listEmployees } from "@/app/api/employees/route";
import { GET as orgChartExport } from "@/app/api/org-chart/export/route";
import { GET as gatewayDirectory } from "@/app/api/gateway/v1/[company]/employees/directory/route";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const ids: {
  employees: number[];
  policies: number[];
  balances: number[];
  requests: number[];
  timesheets: number[];
  titles: number[];
  openings: number[];
  candidates: number[];
  offers: number[];
  fields: number[];
  courses: number[];
  completions: number[];
  documents: number[];
  visas: number[];
  workflows: number[];
} = {
  employees: [],
  policies: [],
  balances: [],
  requests: [],
  timesheets: [],
  titles: [],
  openings: [],
  candidates: [],
  offers: [],
  fields: [],
  courses: [],
  completions: [],
  documents: [],
  visas: [],
  workflows: [],
};

function basicAuth(apiKey: string) {
  return `Basic ${Buffer.from(`${apiKey}:x`).toString("base64")}`;
}

function session(user: { email: string; employeeId: number; role: string }) {
  mockedAuth.mockResolvedValue({
    user: { ...user, name: user.email, id: `user-${user.employeeId}` },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  } as any);
}

describe("Security authz integration (Real Postgres)", () => {
  let runId: number;
  let manager: any;
  let employee: any;
  let outsider: any;
  let viewer: any;
  let admin: any;
  let policy: any;
  let timesheet: any;
  let candidate: any;
  let draftOpening: any;
  let openOpening: any;
  let course: any;
  let managerKey: string;
  let employeeKey: string;

  beforeAll(async () => {
    runId = Date.now();
    managerKey = `mgr-key-${runId}`;
    employeeKey = `emp-key-${runId}`;

    const [adminRow] = await db
      .insert(employees)
      .values({
        employeeNumber: `SEC_ADM_${runId}`,
        firstName: "Sec",
        lastName: "Admin",
        email: `sec.admin.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
      })
      .returning();
    admin = adminRow;
    ids.employees.push(admin.id);

    const [mgr] = await db
      .insert(employees)
      .values({
        employeeNumber: `SEC_MGR_${runId}`,
        firstName: "Sec",
        lastName: "Manager",
        email: `sec.manager.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "manager",
        apiKeyHash: crypto.createHash("sha256").update(managerKey).digest("hex"),
      })
      .returning();
    manager = mgr;
    ids.employees.push(manager.id);

    const [emp] = await db
      .insert(employees)
      .values({
        employeeNumber: `SEC_EMP_${runId}`,
        firstName: "Sec",
        lastName: "Employee",
        email: `sec.employee.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
        managerId: manager.id,
        apiKeyHash: crypto.createHash("sha256").update(employeeKey).digest("hex"),
        sin: "123-456-789",
      })
      .returning();
    employee = emp;
    ids.employees.push(employee.id);

    const [out] = await db
      .insert(employees)
      .values({
        employeeNumber: `SEC_OUT_${runId}`,
        firstName: "Sec",
        lastName: "Outsider",
        email: `sec.outsider.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
      })
      .returning();
    outsider = out;
    ids.employees.push(outsider.id);

    const [view] = await db
      .insert(employees)
      .values({
        employeeNumber: `SEC_VIEW_${runId}`,
        firstName: "Sec",
        lastName: "Viewer",
        email: `sec.viewer.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "global_view",
      })
      .returning();
    viewer = view;
    ids.employees.push(viewer.id);

    const [pol] = await db
      .insert(timeOffPolicies)
      .values({
        name: `Sec Policy ${runId}`,
        policyType: "vacation",
        accrualRate: "15",
        accrualPeriod: "annual",
      })
      .returning();
    policy = pol;
    ids.policies.push(policy.id);

    for (const empId of [employee.id, outsider.id, manager.id]) {
      const [bal] = await db
        .insert(timeOffBalances)
        .values({ employeeId: empId, policyId: policy.id, balance: "20.00" })
        .returning();
      ids.balances.push(bal.id);
    }

    const [req] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: outsider.id,
        policyId: policy.id,
        startDate: "2026-06-01",
        endDate: "2026-06-02",
        daysRequested: "2",
        status: "approved",
      })
      .returning();
    ids.requests.push(req.id);

    const [ts] = await db
      .insert(timesheets)
      .values({
        employeeId: outsider.id,
        weekStartDate: "2026-06-01",
        weekEndDate: "2026-06-07",
        totalHours: "40.00",
        status: "submitted",
      })
      .returning();
    timesheet = ts;
    ids.timesheets.push(timesheet.id);

    const [draft] = await db
      .insert(jobOpenings)
      .values({
        title: `Draft Opening ${runId}`,
        status: "draft",
        employmentType: "full_time",
      })
      .returning();
    draftOpening = draft;
    ids.openings.push(draftOpening.id);

    const [open] = await db
      .insert(jobOpenings)
      .values({
        title: `Open Opening ${runId}`,
        status: "open",
        employmentType: "full_time",
        hiringLeadId: admin.id,
      })
      .returning();
    openOpening = open;
    ids.openings.push(openOpening.id);

    const [cand] = await db
      .insert(candidates)
      .values({
        jobOpeningId: openOpening.id,
        firstName: "Cand",
        lastName: "Idate",
        email: `cand.${runId}@test.com`,
        stage: "interview",
        rating: 3,
      })
      .returning();
    candidate = cand;
    ids.candidates.push(candidate.id);

    const [offer] = await db
      .insert(offerLetters)
      .values({
        candidateId: candidate.id,
        jobTitle: "Engineer",
        salary: "150000",
        startDate: "2026-07-01",
      })
      .returning();
    ids.offers.push(offer.id);

    const [field] = await db
      .insert(customFields)
      .values({
        name: `Comp Field ${runId}`,
        fieldType: "text",
        entityType: "employee",
        section: "compensation",
        visibility: "everyone",
        isRequired: false,
        orderIndex: 1,
      })
      .returning();
    ids.fields.push(field.id);
    await db.insert(customFieldValues).values({
      customFieldId: field.id,
      entityId: employee.id,
      value: "SECRET-BONUS",
    });

    const [crs] = await db
      .insert(trainingCourses)
      .values({ name: `Course ${runId}`, isRequired: false })
      .returning();
    course = crs;
    ids.courses.push(course.id);

    const [doc] = await db
      .insert(documents)
      .values({
        employeeId: employee.id,
        title: `Private I-9 ${runId}`,
        category: "other",
        status: "draft",
        uploadedBy: admin.id,
      })
      .returning();
    ids.documents.push(doc.id);

    const [visa] = await db
      .insert(employeeVisas)
      .values({
        employeeId: employee.id,
        visaType: "H-1B",
        country: "US",
        documentNumber: "VISA-SECRET",
        status: "active",
      })
      .returning();
    ids.visas.push(visa.id);
  });

  afterAll(async () => {
    try {
      if (ids.offers.length) {
        for (const id of ids.offers) await db.delete(offerLetters).where(eq(offerLetters.id, id));
      }
      if (ids.candidates.length) {
        for (const id of ids.candidates) await db.delete(candidates).where(eq(candidates.id, id));
      }
      if (ids.openings.length) {
        for (const id of ids.openings) await db.delete(jobOpenings).where(eq(jobOpenings.id, id));
      }
      if (ids.completions.length) {
        for (const id of ids.completions) {
          await db.delete(trainingCompletions).where(eq(trainingCompletions.id, id));
        }
      }
      if (ids.courses.length) {
        for (const id of ids.courses) await db.delete(trainingCourses).where(eq(trainingCourses.id, id));
      }
      if (ids.fields.length) {
        await db.delete(customFieldValues).where(eq(customFieldValues.entityId, employee.id));
        for (const id of ids.fields) await db.delete(customFields).where(eq(customFields.id, id));
      }
      if (ids.documents.length) {
        for (const id of ids.documents) await db.delete(documents).where(eq(documents.id, id));
      }
      if (ids.visas.length) {
        for (const id of ids.visas) await db.delete(employeeVisas).where(eq(employeeVisas.id, id));
      }
      if (ids.timesheets.length) {
        for (const id of ids.timesheets) await db.delete(timesheets).where(eq(timesheets.id, id));
      }
      if (ids.requests.length) {
        const approvalRows = await db
          .select({ id: approvalRequests.id })
          .from(approvalRequests)
          .where(
            and(
              eq(approvalRequests.entityType, "time_off_request"),
              inArray(approvalRequests.entityId, ids.requests)
            )
          );
        const approvalIds = approvalRows.map((row) => row.id);
        if (approvalIds.length) {
          await db
            .delete(approvalRequestSteps)
            .where(inArray(approvalRequestSteps.approvalRequestId, approvalIds));
          await db.delete(approvalRequests).where(inArray(approvalRequests.id, approvalIds));
        }
        for (const id of ids.requests) await db.delete(timeOffRequests).where(eq(timeOffRequests.id, id));
      }
      if (ids.workflows.length) {
        for (const id of ids.workflows) {
          await db.delete(approvalWorkflowSteps).where(eq(approvalWorkflowSteps.workflowId, id));
          await db.delete(approvalWorkflows).where(eq(approvalWorkflows.id, id));
        }
      }
      if (ids.balances.length) {
        for (const id of ids.balances) await db.delete(timeOffBalances).where(eq(timeOffBalances.id, id));
      }
      if (ids.policies.length) {
        for (const id of ids.policies) await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, id));
      }
      if (ids.titles.length) {
        for (const id of ids.titles) await db.delete(jobTitles).where(eq(jobTitles.id, id));
      }
      await db.delete(rateLimits).where(eq(rateLimits.identifier, `sec-rate-${runId}`));
      if (ids.employees.length) {
        await db.delete(auditLogs).where(inArray(auditLogs.employeeId, ids.employees));
        for (const id of ids.employees) await db.delete(employees).where(eq(employees.id, id));
      }
    } catch (error) {
      console.error("Security authz cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("visa document numbers are redacted for unauthorized viewers", () => {
    const redacted = redactVisaDocumentNumber(
      { documentNumber: "VISA-SECRET" },
      false
    );
    expect(redacted.documentNumber).toBeNull();
  });

  test("approval progress payload does not include SIN", async () => {
    const data = await getApprovalRequestForEntity("time_off_request", -1);
    expect(data).toBeNull();
  });

  test("self-service API leave requires manager then admin; legacy cannot skip", async () => {
    const [workflow] = await db
      .insert(approvalWorkflows)
      .values({
        name: `Sec Time Off ${runId}`,
        type: "time_off",
        enabled: true,
        requiresManagerApproval: true,
        requiresAdminApproval: true,
      })
      .returning();

    await db.insert(approvalWorkflowSteps).values([
      { workflowId: workflow.id, stepOrder: 1, approverRole: "manager", requiredCount: 1 },
      { workflowId: workflow.id, stepOrder: 2, approverRole: "full_admin", requiredCount: 1 },
    ]);
    ids.workflows.push(workflow.id);

    const previouslyEnabled = await db
      .select({ id: approvalWorkflows.id })
      .from(approvalWorkflows)
      .where(
        and(
          eq(approvalWorkflows.type, "time_off"),
          eq(approvalWorkflows.enabled, true)
        )
      );
    const others = previouslyEnabled.filter((row) => row.id !== workflow.id).map((row) => row.id);
    if (others.length) {
      await db
        .update(approvalWorkflows)
        .set({ enabled: false })
        .where(inArray(approvalWorkflows.id, others));
    }

    try {
      const req = new NextRequest("http://localhost/api/bamboo/v1/time-off/create", {
        method: "POST",
        headers: {
          authorization: basicAuth(employeeKey),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
          policyId: policy.id,
          start: "2026-09-14",
          end: "2026-09-15",
        }),
      });
      const res = await createTimeOffApi(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      const requestId = parseInt(body.id, 10);
      ids.requests.push(requestId);

      const approval = await getApprovalRequestForEntity("time_off_request", requestId);
      expect(approval).not.toBeNull();
      expect(approval!.steps.length).toBe(2);
      expect(approval!.request.status).toBe("pending");

      session({ email: admin.email, employeeId: admin.id, role: "admin" });
      const early = await approveTimeOffRequest(requestId);
      expect(early.success).toBe(false);
      const [stillPending] = await db
        .select({ status: timeOffRequests.status })
        .from(timeOffRequests)
        .where(eq(timeOffRequests.id, requestId));
      expect(stillPending.status).toBe("pending");

      session({ email: manager.email, employeeId: manager.id, role: "manager" });
      const managerStep = await approveTimeOffRequest(requestId);
      expect(managerStep.success).toBe(true);
      const [afterManager] = await db
        .select({ status: timeOffRequests.status })
        .from(timeOffRequests)
        .where(eq(timeOffRequests.id, requestId));
      expect(afterManager.status).toBe("pending");

      session({ email: admin.email, employeeId: admin.id, role: "admin" });
      const adminStep = await approveTimeOffRequest(requestId);
      expect(adminStep.success).toBe(true);
      const [done] = await db
        .select({ status: timeOffRequests.status })
        .from(timeOffRequests)
        .where(eq(timeOffRequests.id, requestId));
      expect(done.status).toBe("approved");
    } finally {
      if (others.length) {
        await db
          .update(approvalWorkflows)
          .set({ enabled: true })
          .where(inArray(approvalWorkflows.id, others));
      }
    }
  });

  test("manager API key cannot forge approved leave for an unrelated employee", async () => {
    const req = new NextRequest("http://localhost/api/bamboo/v1/time-off/create", {
      method: "POST",
      headers: {
        authorization: basicAuth(managerKey),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        employeeId: outsider.id,
        policyId: policy.id,
        start: "2026-08-01",
        end: "2026-08-02",
        status: "approved",
      }),
    });
    const res = await createTimeOffApi(req);
    expect(res.status).toBe(403);
  });

  test("employee API key cannot list a coworker's leave history", async () => {
    const req = new NextRequest(
      `http://localhost/api/bamboo/v1/time-off/requests?employeeId=${outsider.id}`,
      { headers: { authorization: basicAuth(employeeKey) } }
    );
    const res = await listTimeOffApi(req);
    expect(res.status).toBe(403);
  });

  test("viewing role cannot approve an unrelated timesheet", async () => {
    session({ email: viewer.email, employeeId: viewer.id, role: "admin" });
    const req = new NextRequest(
      `http://localhost/api/time-tracking/timesheets/${timesheet.id}/approve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      }
    );
    const res = await approveTimesheet(req, {
      params: Promise.resolve({ id: String(timesheet.id) }),
    });
    expect(res.status).toBe(403);
  });

  test("unset CRON_SECRET rejects anonymous accrual", async () => {
    const prev = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    const req = new NextRequest("http://localhost/api/cron/accrue-time-off", {
      headers: { authorization: "Bearer undefined" },
    });
    const res = await cronAccrue(req);
    expect(res.status).toBe(401);
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });

  test("timestamp leave requests use calendar days and recheck balance", async () => {
    session({ email: employee.email, employeeId: employee.id, role: "employee" });
    const req = new NextRequest("http://localhost/api/time-off/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        policyId: policy.id,
        startDate: "2026-09-01T23:00:00.000Z",
        endDate: "2026-09-03T01:00:00.000Z",
      }),
    });
    const res = await createSessionTimeOff(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(parseFloat(body.daysRequested)).toBe(3);
    ids.requests.push(body.id);
  });

  test("unrelated employees cannot change hiring decisions or add notes", async () => {
    session({ email: outsider.email, employeeId: outsider.id, role: "employee" });
    const patchReq = new NextRequest(
      `http://localhost/api/hiring/candidates/${candidate.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: "hired", rating: 999999 }),
      }
    );
    const patchRes = await patchCandidate(patchReq, {
      params: Promise.resolve({ id: String(candidate.id) }),
    });
    expect(patchRes.status).toBe(403);

    const noteReq = new NextRequest(
      `http://localhost/api/hiring/candidates/${candidate.id}/notes`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "should not land" }),
      }
    );
    const noteRes = await addCandidateNote(noteReq, {
      params: Promise.resolve({ id: String(candidate.id) }),
    });
    expect(noteRes.status).toBe(403);

    const getRes = await getCandidate(
      new NextRequest(`http://localhost/api/hiring/candidates/${candidate.id}`),
      { params: Promise.resolve({ id: String(candidate.id) }) }
    );
    expect(getRes.status).toBe(403);
  });

  test("hiring lead or full admin can read candidate PII; public careers omit it", async () => {
    session({ email: admin.email, employeeId: admin.id, role: "full_admin" });
    const getRes = await getCandidate(
      new NextRequest(`http://localhost/api/hiring/candidates/${candidate.id}`),
      { params: Promise.resolve({ id: String(candidate.id) }) }
    );
    expect(getRes.status).toBe(200);
    const hired = await getRes.json();
    expect(hired.candidate.email).toBe(candidate.email);

    const listRes = await listPublicCareers();
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    const listed = (listBody.openings || []).find((o: { id: number }) => o.id === openOpening.id);
    expect(listed).toBeTruthy();
    expect(listed).not.toHaveProperty("hiringLeadId");
    expect(JSON.stringify(listed)).not.toMatch(/@test\.com|hiringLead/i);

    const draftRes = await getPublicCareer(
      new NextRequest(`http://localhost/api/careers/openings/${draftOpening.id}`),
      { params: Promise.resolve({ id: String(draftOpening.id) }) }
    );
    expect(draftRes.status).toBe(404);

    const applyRes = await applyToOpening(
      new NextRequest("http://localhost/api/hiring/candidates/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobOpeningId: openOpening.id,
          firstName: "Pub",
          lastName: "Lic",
          email: `public.apply.${runId}@example.com`,
        }),
      })
    );
    expect(applyRes.status).toBe(200);
    const applyBody = await applyRes.json();
    expect(applyBody).toEqual({ success: true });
    const applied = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.email, `public.apply.${runId}@example.com`));
    ids.candidates.push(...applied.map((row) => row.id));
  });

  test("full admin ratings are clamped to 5", async () => {
    session({ email: admin.email, employeeId: admin.id, role: "full_admin" });
    const patchReq = new NextRequest(
      `http://localhost/api/hiring/candidates/${candidate.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating: 999999 }),
      }
    );
    const patchRes = await patchCandidate(patchReq, {
      params: Promise.resolve({ id: String(candidate.id) }),
    });
    expect(patchRes.status).toBe(200);
    const body = await patchRes.json();
    expect(body.rating).toBe(5);
  });

  test("viewing role cannot create job titles", async () => {
    session({ email: viewer.email, employeeId: viewer.id, role: "admin" });
    const req = new NextRequest("http://localhost/api/settings/job-titles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `Forbidden Title ${runId}` }),
    });
    const res = await createJobTitle(req);
    expect(res.status).toBe(403);
  });

  test("full admin can create job titles even when session role is admin", async () => {
    session({ email: admin.email, employeeId: admin.id, role: "admin" });
    const req = new NextRequest("http://localhost/api/settings/job-titles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `Allowed Title ${runId}` }),
    });
    const res = await createJobTitle(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    if (body.jobTitle?.id) ids.titles.push(body.jobTitle.id);
  });

  test("custom-field compensation values are hidden from coworkers", async () => {
    session({ email: outsider.email, employeeId: outsider.id, role: "employee" });
    const req = new NextRequest(
      `http://localhost/api/custom-fields/values?entityId=${employee.id}`
    );
    const res = await getCustomFieldValues(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const leaked = (body.values || []).some((v: { value: string }) => v.value === "SECRET-BONUS");
    expect(leaked).toBe(false);
  });

  test("managers cannot assign training outside their reports", async () => {
    session({ email: manager.email, employeeId: manager.id, role: "manager" });
    const req = new NextRequest("http://localhost/api/training/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "individual",
        courseId: course.id,
        employeeIds: [outsider.id],
      }),
    });
    const res = await assignTraining(req);
    expect(res.status).toBe(403);
  });

  test("unpublished openings cannot be applied to", async () => {
    const req = new NextRequest("http://localhost/api/hiring/candidates/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobOpeningId: draftOpening.id,
        firstName: "Out",
        lastName: "Sider",
        email: `apply.${runId}@example.com`,
      }),
    });
    const res = await applyToOpening(req);
    expect(res.status).toBe(404);
  });

  test("logged-in non-admin gets 403 on report export", async () => {
    session({ email: outsider.email, employeeId: outsider.id, role: "employee" });
    const req = new NextRequest("http://localhost/api/reports/export?type=headcount");
    const res = await exportReports(req);
    expect(res.status).toBe(403);
  });

  test("viewing role cannot export pay-by-title even with session admin", async () => {
    session({ email: viewer.email, employeeId: viewer.id, role: "admin" });
    const req = new NextRequest("http://localhost/api/reports/export?type=pay-by-title");
    const res = await exportReports(req);
    expect(res.status).toBe(403);
  });

  test("directory and API exports keep @vendasta.com and hide personal emails", async () => {
    await db
      .insert(accessLevels)
      .values({
        name: `Sec Privacy Admin ${runId}`,
        code: "full_admin",
        canViewSensitivePersonalInfo: true,
        canManageUsers: true,
        canViewCompensation: true,
        canEditCompensation: false,
        canEditSensitivePersonalInfo: false,
        canViewBankInfo: false,
        canEditBankInfo: false,
        canManageSettings: true,
        canApproveTimeOff: true,
        canApproveCompensationChanges: true,
      })
      .onConflictDoNothing();

    const [work] = await db
      .insert(employees)
      .values({
        employeeNumber: `SEC_WORK_${runId}`,
        firstName: "Work",
        lastName: "Mail",
        email: `privacy.work.${runId}@vendasta.com`,
        personalEmail: `privacy.work.${runId}@gmail.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
        managerId: manager.id,
      })
      .returning();
    const [personal] = await db
      .insert(employees)
      .values({
        employeeNumber: `SEC_HOME_${runId}`,
        firstName: "Home",
        lastName: "Mail",
        email: `privacy.home.${runId}@gmail.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
        managerId: manager.id,
      })
      .returning();
    ids.employees.push(work.id, personal.id);

    const managerDir = await bambooDirectory(
      new NextRequest("http://localhost/api/bamboo/v1/employees/directory", {
        headers: { authorization: basicAuth(managerKey) },
      })
    );
    expect(managerDir.status).toBe(200);
    const managerBody = await managerDir.json();
    const managerEmails = (managerBody.employees || []).map((row: { workEmail?: string | null }) => row.workEmail);
    expect(managerEmails).toContain(`privacy.work.${runId}@vendasta.com`);
    expect(managerEmails).not.toContain(`privacy.home.${runId}@gmail.com`);
    expect(managerEmails).not.toContain(`privacy.work.${runId}@gmail.com`);

    const adminKey = `adm-key-${runId}`;
    await db
      .update(employees)
      .set({ apiKeyHash: crypto.createHash("sha256").update(adminKey).digest("hex") })
      .where(eq(employees.id, admin.id));

    const adminDir = await bambooDirectory(
      new NextRequest("http://localhost/api/bamboo/v1/employees/directory", {
        headers: { authorization: basicAuth(adminKey) },
      })
    );
    expect(adminDir.status).toBe(200);
    const adminBody = await adminDir.json();
    const adminEmails = (adminBody.employees || []).map((row: { workEmail?: string | null }) => row.workEmail);
    expect(adminEmails).toContain(`privacy.work.${runId}@vendasta.com`);
    expect(adminEmails).not.toContain(`privacy.home.${runId}@gmail.com`);

    const adminPersonal = await bambooEmployee(
      new NextRequest(`http://localhost/api/bamboo/v1/employees/${personal.id}`, {
        headers: { authorization: basicAuth(adminKey) },
      }),
      { params: Promise.resolve({ id: String(personal.id) }) }
    );
    expect(adminPersonal.status).toBe(200);
    expect((await adminPersonal.json()).workEmail).toBe(`privacy.home.${runId}@gmail.com`);

    const gw = await gatewayDirectory(
      new NextRequest("http://localhost/api/gateway/v1/acme/employees/directory", {
        headers: { authorization: basicAuth(managerKey) },
      }),
      { params: Promise.resolve({ company: "acme" }) }
    );
    expect(gw.status).toBe(200);
    const gwBody = await gw.json();
    const gwEmails = (gwBody.employees || []).map((row: { email?: string | null }) => row.email);
    expect(gwEmails).toContain(`privacy.work.${runId}@vendasta.com`);
    expect(gwEmails).not.toContain(`privacy.home.${runId}@gmail.com`);

    const mgrPersonal = await bambooEmployee(
      new NextRequest(`http://localhost/api/bamboo/v1/employees/${personal.id}`, {
        headers: { authorization: basicAuth(managerKey) },
      }),
      { params: Promise.resolve({ id: String(personal.id) }) }
    );
    expect(mgrPersonal.status).toBe(200);
    const mgrPersonalBody = await mgrPersonal.json();
    expect(mgrPersonalBody.workEmail).toBeNull();

    const mgrWork = await bambooEmployee(
      new NextRequest(`http://localhost/api/bamboo/v1/employees/${work.id}`, {
        headers: { authorization: basicAuth(managerKey) },
      }),
      { params: Promise.resolve({ id: String(work.id) }) }
    );
    expect(mgrWork.status).toBe(200);
    expect((await mgrWork.json()).workEmail).toBe(`privacy.work.${runId}@vendasta.com`);

    session({ email: viewer.email, employeeId: viewer.id, role: "admin" });
    const exportRes = await exportReports(
      new NextRequest("http://localhost/api/reports/export?type=employees")
    );
    expect(exportRes.status).toBe(200);
    const csv = await exportRes.text();
    expect(csv).toContain(`privacy.work.${runId}@vendasta.com`);
    expect(csv).not.toContain(`privacy.home.${runId}@gmail.com`);
    expect(csv).not.toContain(`privacy.work.${runId}@gmail.com`);

    session({ email: admin.email, employeeId: admin.id, role: "full_admin" });
    const hrExport = await exportReports(
      new NextRequest("http://localhost/api/reports/export?type=employees")
    );
    expect(hrExport.status).toBe(200);
    const hrCsv = await hrExport.text();
    expect(hrCsv).toContain(`privacy.work.${runId}@vendasta.com`);
    expect(hrCsv).toContain(`privacy.home.${runId}@gmail.com`);

    const orgRes = await orgChartExport(new NextRequest("http://localhost/api/org-chart/export"));
    expect(orgRes.status).toBe(200);
    const orgCsv = await orgRes.text();
    expect(orgCsv).toContain(`privacy.work.${runId}@vendasta.com`);
    expect(orgCsv).not.toContain(`privacy.home.${runId}@gmail.com`);

    session({ email: viewer.email, employeeId: viewer.id, role: "admin" });
    const listRes = await listEmployees(new NextRequest("http://localhost/api/employees"));
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    const listEmails = (listBody.employees || []).map((row: { email?: string | null }) => row.email);
    expect(listEmails).toContain(`privacy.work.${runId}@vendasta.com`);
    expect(listEmails).not.toContain(`privacy.home.${runId}@gmail.com`);

    session({ email: outsider.email, employeeId: outsider.id, role: "employee" });
    const scopedList = await listEmployees(new NextRequest("http://localhost/api/employees"));
    expect(scopedList.status).toBe(200);
    const scopedEmails = ((await scopedList.json()).employees || []).map(
      (row: { email?: string | null }) => row.email
    );
    expect(scopedEmails).not.toContain(`privacy.work.${runId}@vendasta.com`);
    expect(scopedEmails).not.toContain(`privacy.home.${runId}@gmail.com`);
  });

  test("rate limiter is atomic across concurrent requests", async () => {
    const identifier = `sec-rate-${runId}`;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        checkRateLimit(identifier, "/api/hiring/candidates/apply", {
          maxAttempts: 3,
          windowMs: 60_000,
        })
      )
    );
    const allowed = results.filter((r) => r.success).length;
    const denied = results.filter((r) => !r.success).length;
    expect(allowed).toBe(3);
    expect(denied).toBe(5);
  });
});
