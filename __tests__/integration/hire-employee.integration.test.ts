import { NextRequest } from "next/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, inArray } from "drizzle-orm";
import {
  employees,
  jobOpenings,
  candidates,
  offerLetters,
  auditLogs,
  accessLevels,
  users,
  employmentStatusHistory,
  employeeTasks,
} from "@/lib/db/schema";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

import { auth } from "@/lib/auth";
import { POST as createEmployee } from "@/app/api/employees/create/route";
import { PATCH as patchCandidate } from "@/app/api/hiring/candidates/[id]/route";
import { GET as listPublicCareers } from "@/app/api/careers/openings/route";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

function session(user: { email: string; employeeId: number; role: string }) {
  mockedAuth.mockResolvedValue({
    user: { ...user, name: user.email, id: `user-${user.employeeId}` },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  } as any);
}

describe("Hired → employee prefill (Real Postgres)", () => {
  const runId = Date.now();
  const ids = {
    employees: [] as number[],
    openings: [] as number[],
    candidates: [] as number[],
    offers: [] as number[],
  };
  let admin: { id: number; email: string };
  let lead: { id: number; email: string };
  let outsider: { id: number; email: string };
  let opening: { id: number };
  let hired: { id: number; email: string };
  let interview: { id: number };

  beforeAll(async () => {
    await db
      .insert(accessLevels)
      .values({
        name: `Hire Admin ${runId}`,
        code: "full_admin",
        canManageUsers: true,
        canViewCompensation: true,
        canEditCompensation: true,
        canViewSensitivePersonalInfo: true,
        canEditSensitivePersonalInfo: true,
        canViewBankInfo: true,
        canEditBankInfo: true,
        canManageSettings: true,
        canApproveTimeOff: true,
        canApproveCompensationChanges: true,
      })
      .onConflictDoNothing();

    const [adminRow] = await db
      .insert(employees)
      .values({
        employeeNumber: `HIRE_ADM_${runId}`,
        firstName: "Hire",
        lastName: "Admin",
        email: `hire.admin.${runId}@vendasta.com`,
        hireDate: "2018-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
        jobTitle: "VP People",
      })
      .returning();
    admin = adminRow;
    ids.employees.push(admin.id);

    const [leadRow] = await db
      .insert(employees)
      .values({
        employeeNumber: `HIRE_LEAD_${runId}`,
        firstName: "Hire",
        lastName: "Lead",
        email: `hire.lead.${runId}@vendasta.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "manager",
        jobTitle: "Engineering Manager",
      })
      .returning();
    lead = leadRow;
    ids.employees.push(lead.id);

    const [outRow] = await db
      .insert(employees)
      .values({
        employeeNumber: `HIRE_OUT_${runId}`,
        firstName: "Hire",
        lastName: "Outsider",
        email: `hire.out.${runId}@test.com`,
        hireDate: "2022-01-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
      })
      .returning();
    outsider = outRow;
    ids.employees.push(outsider.id);

    const [openRow] = await db
      .insert(jobOpenings)
      .values({
        title: `Hire Opening ${runId}`,
        status: "open",
        employmentType: "full_time",
        hiringLeadId: lead.id,
      })
      .returning();
    opening = openRow;
    ids.openings.push(opening.id);

    const [hiredRow] = await db
      .insert(candidates)
      .values({
        jobOpeningId: opening.id,
        firstName: "Sam",
        lastName: "Hired",
        email: `sam.hired.${runId}@gmail.com`,
        phone: "555-0100",
        linkedinUrl: "https://linkedin.com/in/sam-hired",
        stage: "hired",
      })
      .returning();
    hired = hiredRow;
    ids.candidates.push(hired.id);

    const [offer] = await db
      .insert(offerLetters)
      .values({
        candidateId: hired.id,
        jobTitle: "Software Engineer",
        salary: "140000",
        startDate: "2026-12-01",
      })
      .returning();
    ids.offers.push(offer.id);

    const [interviewRow] = await db
      .insert(candidates)
      .values({
        jobOpeningId: opening.id,
        firstName: "Pat",
        lastName: "Interview",
        email: `pat.interview.${runId}@gmail.com`,
        stage: "interview",
      })
      .returning();
    interview = interviewRow;
    ids.candidates.push(interview.id);
  });

  afterAll(async () => {
    try {
      if (ids.employees.length) {
        await db
          .delete(employeeTasks)
          .where(inArray(employeeTasks.assignedToId, ids.employees));
        await db
          .delete(employeeTasks)
          .where(inArray(employeeTasks.employeeId, ids.employees));
        await db.delete(auditLogs).where(inArray(auditLogs.employeeId, ids.employees));
        for (const id of ids.employees) {
          await db.delete(auditLogs).where(eq(auditLogs.entityId, String(id)));
        }
        await db
          .delete(employmentStatusHistory)
          .where(inArray(employmentStatusHistory.recordedById, ids.employees));
        await db
          .delete(employmentStatusHistory)
          .where(inArray(employmentStatusHistory.employeeId, ids.employees));
        await db
          .update(jobOpenings)
          .set({ hiringLeadId: null })
          .where(inArray(jobOpenings.hiringLeadId, ids.employees));
      }
      if (ids.offers.length) {
        await db.delete(offerLetters).where(inArray(offerLetters.id, ids.offers));
      }
      if (ids.candidates.length) {
        await db.delete(candidates).where(inArray(candidates.id, ids.candidates));
      }
      if (ids.openings.length) {
        await db.delete(jobOpenings).where(inArray(jobOpenings.id, ids.openings));
      }
      if (ids.employees.length) {
        await db.delete(employees).where(inArray(employees.id, ids.employees));
      }
    } finally {
      await pool.end();
    }
  });

  test("PATCH stage=hired does not create an employee or login", async () => {
    const usersBefore = await db.select({ id: users.id }).from(users);
    const employeesBefore = await db.select({ id: employees.id }).from(employees);

    session({ email: admin.email, employeeId: admin.id, role: "full_admin" });
    const res = await patchCandidate(
      new NextRequest(`http://localhost/api/hiring/candidates/${interview.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: "hired" }),
      }),
      { params: Promise.resolve({ id: String(interview.id) }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stage).toBe("hired");
    expect(body.employeeId).toBeNull();

    const usersAfter = await db.select({ id: users.id }).from(users);
    const employeesAfter = await db.select({ id: employees.id }).from(employees);
    expect(usersAfter.length).toBe(usersBefore.length);
    expect(employeesAfter.length).toBe(employeesBefore.length);
  });

  test("outsider cannot create an employee from a hired candidate", async () => {
    session({ email: outsider.email, employeeId: outsider.id, role: "employee" });
    const res = await createEmployee(
      new NextRequest("http://localhost/api/employees/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateId: hired.id,
          firstName: "Sam",
          lastName: "Hired",
          email: hired.email,
          hireDate: "2026-12-01",
          jobTitle: "Engineer",
        }),
      })
    );
    expect(res.status).toBe(403);
  });

  test("hiring lead cannot assign an out-of-scope manager", async () => {
    session({ email: lead.email, employeeId: lead.id, role: "manager" });
    const res = await createEmployee(
      new NextRequest("http://localhost/api/employees/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateId: hired.id,
          firstName: "Sam",
          lastName: "Hired",
          email: hired.email,
          hireDate: "2026-12-01",
          jobTitle: "Engineer",
          managerId: outsider.id,
        }),
      })
    );
    expect(res.status).toBe(403);
  });

  test("hiring lead prefills create, links the candidate, and does not provision login", async () => {
    const usersBefore = await db.select({ id: users.id }).from(users);
    session({ email: lead.email, employeeId: lead.id, role: "manager" });
    const res = await createEmployee(
      new NextRequest("http://localhost/api/employees/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateId: hired.id,
          firstName: "Sam",
          lastName: "Hired",
          email: hired.email,
          hireDate: "2026-12-01",
          jobTitle: "Software Engineer",
          workPhone: "555-0100",
          linkedInUrl: "https://linkedin.com/in/sam-hired",
          accessLevel: "full_admin",
        }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.employee.email).toBe(hired.email);
    expect(body.employee.candidateId).toBe(hired.id);
    expect(JSON.stringify(body)).not.toMatch(/140000|salary/i);
    ids.employees.push(body.employee.id);

    const [created] = await db
      .select({
        id: employees.id,
        accessLevel: employees.accessLevel,
        userId: employees.userId,
        vendastaSub: employees.vendastaSub,
      })
      .from(employees)
      .where(eq(employees.id, body.employee.id))
      .limit(1);
    expect(created.accessLevel).toBe("employee");
    expect(created.userId).toBeNull();
    expect(created.vendastaSub).toBeNull();

    const [linked] = await db
      .select({ employeeId: candidates.employeeId })
      .from(candidates)
      .where(eq(candidates.id, hired.id))
      .limit(1);
    expect(linked.employeeId).toBe(created.id);

    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, String(created.id)));
    expect(audits.some((row) => row.action === "employee_created")).toBe(true);
    expect(
      audits.some(
        (row) =>
          row.changes &&
          typeof row.changes === "object" &&
          (row.changes as { candidateId?: number }).candidateId === hired.id
      )
    ).toBe(true);

    const usersAfter = await db.select({ id: users.id }).from(users);
    expect(usersAfter.length).toBe(usersBefore.length);

    const again = await createEmployee(
      new NextRequest("http://localhost/api/employees/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateId: hired.id,
          firstName: "Sam",
          lastName: "Hired",
          email: `sam.dup.${runId}@gmail.com`,
          hireDate: "2026-12-01",
          jobTitle: "Software Engineer",
        }),
      })
    );
    expect(again.status).toBe(409);
  });

  test("public careers DTO still omits employees and applicants", async () => {
    const res = await listPublicCareers();
    expect(res.status).toBe(200);
    const body = await res.json();
    const listed = (body.openings || []).find((o: { id: number }) => o.id === opening.id);
    expect(listed).toBeTruthy();
    expect(listed).not.toHaveProperty("hiringLeadId");
    expect(JSON.stringify(listed)).not.toMatch(/gmail|candidate|employeeId/i);
  });
});
