import { NextRequest } from "next/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import {
  employees,
  letterTemplates,
  documents,
  auditLogs,
  accessLevels,
  compensationHistory,
} from "@/lib/db/schema";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

import { auth } from "@/lib/auth";
import { POST as issueLetter } from "@/app/api/letter-templates/[id]/issue/route";
import { POST as signDocument } from "@/app/api/documents/[id]/sign/route";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

function session(user: { email: string; employeeId: number; role: string }) {
  mockedAuth.mockResolvedValue({
    user: { ...user, name: user.email, id: `user-${user.employeeId}` },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  } as any);
}

describe("Letter issuance (Real Postgres)", () => {
  const runId = Date.now();
  const ids = {
    employees: [] as number[],
    templates: [] as number[],
    documents: [] as number[],
    compensation: [] as number[],
  };
  let admin: { id: number; email: string };
  let target: { id: number; email: string; firstName: string };
  let outsider: { id: number; email: string };
  let template: { id: number; slug: string };

  beforeAll(async () => {
    await db
      .insert(accessLevels)
      .values({
        name: `Letter Admin ${runId}`,
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
        employeeNumber: `LTR_ADM_${runId}`,
        firstName: "Letter",
        lastName: "Admin",
        email: `letter.admin.${runId}@vendasta.com`,
        hireDate: "2018-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
        jobTitle: "VP People",
      })
      .returning();
    admin = adminRow;
    ids.employees.push(admin.id);

    const [targetRow] = await db
      .insert(employees)
      .values({
        employeeNumber: `LTR_TGT_${runId}`,
        firstName: "Ada",
        lastName: "Target",
        email: `letter.target.${runId}@vendasta.com`,
        hireDate: "2024-01-15",
        employmentStatus: "full_time",
        accessLevel: "employee",
        jobTitle: "Engineer",
      })
      .returning();
    target = targetRow;
    ids.employees.push(target.id);

    const [outRow] = await db
      .insert(employees)
      .values({
        employeeNumber: `LTR_OUT_${runId}`,
        firstName: "Letter",
        lastName: "Outsider",
        email: `letter.out.${runId}@test.com`,
        hireDate: "2022-01-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
      })
      .returning();
    outsider = outRow;
    ids.employees.push(outsider.id);

    const [comp] = await db
      .insert(compensationHistory)
      .values({
        employeeId: target.id,
        effectiveDate: "2024-01-15",
        payRate: "125000.00",
        currency: "CAD",
      })
      .returning();
    ids.compensation.push(comp.id);

    const [tpl] = await db
      .insert(letterTemplates)
      .values({
        slug: `offer-${runId}`,
        name: "Offer letter",
        category: "offer",
        subject: "Offer of employment — {{jobTitle}}",
        body: "Dear {{firstName}}, compensation {{payRate}} at {{companyName}}.",
        requiresSignature: true,
      })
      .returning();
    template = tpl;
    ids.templates.push(template.id);
  });

  afterAll(async () => {
    try {
      for (const id of ids.documents) {
        await db.delete(auditLogs).where(eq(auditLogs.entityId, String(id)));
        await db.delete(documents).where(eq(documents.id, id));
      }
      for (const id of ids.compensation) {
        await db.delete(compensationHistory).where(eq(compensationHistory.id, id));
      }
      for (const id of ids.templates) {
        await db.delete(letterTemplates).where(eq(letterTemplates.id, id));
      }
      for (const id of ids.employees) {
        await db.delete(employees).where(eq(employees.id, id));
      }
    } finally {
      await pool.end();
    }
  });

  test("employee cannot issue letters", async () => {
    session({ email: outsider.email, employeeId: outsider.id, role: "employee" });
    const res = await issueLetter(
      new NextRequest(`http://localhost/api/letter-templates/${template.id}/issue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: target.id }),
      }),
      { params: Promise.resolve({ id: String(template.id) }) }
    );
    expect(res.status).toBe(403);
  });

  test("rejects client-supplied merge overrides", async () => {
    session({ email: admin.email, employeeId: admin.id, role: "full_admin" });
    const res = await issueLetter(
      new NextRequest(`http://localhost/api/letter-templates/${template.id}/issue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: target.id, payRate: "1" }),
      }),
      { params: Promise.resolve({ id: String(template.id) }) }
    );
    expect(res.status).toBe(400);
  });

  test("HR issues into pending_signature, owner can sign, issuance is audited", async () => {
    session({ email: admin.email, employeeId: admin.id, role: "full_admin" });
    const res = await issueLetter(
      new NextRequest(`http://localhost/api/letter-templates/${template.id}/issue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: target.id }),
      }),
      { params: Promise.resolve({ id: String(template.id) }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.document.status).toBe("pending_signature");
    expect(body.document.category).toBe("letter");
    expect(body.document.body).toContain("Dear Ada");
    expect(body.document.body).toContain("125000");
    expect(body.document.body).not.toMatch(/India|GST|Shops and Establishments/i);
    expect(body.document.containsCompensation).toBe(true);
    ids.documents.push(body.document.id);

    const [stored] = await db
      .select({
        containsCompensation: documents.containsCompensation,
        body: documents.body,
      })
      .from(documents)
      .where(eq(documents.id, body.document.id))
      .limit(1);
    expect(stored.containsCompensation).toBe(true);
    expect(stored.body).toContain("125000");

    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "letter_issued"));
    const issued = audits.find((row) => row.entityId === String(body.document.id));
    expect(issued).toBeTruthy();
    expect(JSON.stringify(issued?.changes)).toContain(template.slug);

    session({ email: outsider.email, employeeId: outsider.id, role: "employee" });
    const outsiderSign = await signDocument(
      new NextRequest(`http://localhost/api/documents/${body.document.id}/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: String(body.document.id) }) }
    );
    expect(outsiderSign.status).toBe(403);

    session({ email: target.email, employeeId: target.id, role: "employee" });
    const sign = await signDocument(
      new NextRequest(`http://localhost/api/documents/${body.document.id}/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: String(body.document.id) }) }
    );
    expect(sign.status).toBe(200);
    expect((await sign.json()).document.status).toBe("signed");
  });
});
