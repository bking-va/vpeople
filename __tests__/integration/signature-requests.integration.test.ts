import { NextRequest } from "next/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import {
  employees,
  documents,
  signatureRequests,
  accessLevels,
  auditLogs,
} from "@/lib/db/schema";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@vercel/blob", () => ({
  put: jest.fn(async () => ({ url: "https://blob.vercel-storage.com/signed.pdf" })),
}));

const createDraft = jest.fn();
const setFields = jest.fn();
const send = jest.fn();
const getPdf = jest.fn();
const defaultFieldsFor = jest.fn();

jest.mock("@/lib/vsign/client", () => ({
  isVsignConfigured: () => true,
  vsignCallbackUrl: () => "https://vpeople.test/api/integrations/vsign/webhook",
  VsignNotConfiguredError: class VsignNotConfiguredError extends Error {},
  VsignApiError: class VsignApiError extends Error {
    status = 502;
  },
  createVsignClient: () => ({
    createDraft,
    setFields,
    send,
    getPdf,
    defaultFieldsFor,
  }),
}));

import { auth } from "@/lib/auth";
import { POST as preview } from "@/app/api/documents/[id]/signature-requests/route";
import { POST as sendRoute } from "@/app/api/signature-requests/[id]/send/route";
import { applyVsignWebhook } from "@/lib/signature-requests";
import { createVsignClient } from "@/lib/vsign/client";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

function session(user: { email: string; employeeId: number; role: string }) {
  mockedAuth.mockResolvedValue({
    user: { ...user, name: user.email, id: `user-${user.employeeId}` },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  } as never);
}

describe("vSign signature requests (Real Postgres)", () => {
  const runId = Date.now();
  const ids = { employees: [] as number[], documents: [] as number[], requests: [] as number[] };
  let admin: { id: number; email: string };
  let target: { id: number; email: string };
  let outsider: { id: number; email: string };
  let documentId: number;

  beforeAll(async () => {
    await db
      .insert(accessLevels)
      .values({
        name: `Sign Admin ${runId}`,
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
        employeeNumber: `SIG_ADM_${runId}`,
        firstName: "Sign",
        lastName: "Admin",
        email: `sign.admin.${runId}@vendasta.com`,
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
        employeeNumber: `SIG_TGT_${runId}`,
        firstName: "Ada",
        lastName: "Target",
        email: `sign.target.${runId}@vendasta.com`,
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
        employeeNumber: `SIG_OUT_${runId}`,
        firstName: "Sign",
        lastName: "Outsider",
        email: `sign.out.${runId}@test.com`,
        hireDate: "2022-01-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
      })
      .returning();
    outsider = outRow;
    ids.employees.push(outsider.id);

    const [doc] = await db
      .insert(documents)
      .values({
        employeeId: target.id,
        title: "Offer letter",
        category: "letter",
        status: "pending_signature",
        body: "Dear Ada Target,\nPlease sign this letter to confirm your acceptance.",
        uploadedBy: admin.id,
      })
      .returning();
    documentId = doc.id;
    ids.documents.push(doc.id);
  });

  afterAll(async () => {
    if (ids.requests.length) {
      for (const id of ids.requests) {
        await db.delete(signatureRequests).where(eq(signatureRequests.id, id));
      }
    }
    if (ids.documents.length) {
      for (const id of ids.documents) {
        await db.delete(documents).where(eq(documents.id, id));
      }
    }
    if (ids.employees.length) {
      await db.delete(auditLogs).where(eq(auditLogs.employeeId, admin.id));
      for (const id of ids.employees) {
        await db.delete(employees).where(eq(employees.id, id));
      }
    }
    await pool.end();
  });

  beforeEach(() => {
    createDraft.mockReset();
    setFields.mockReset();
    send.mockReset();
    getPdf.mockReset();
    defaultFieldsFor.mockReset();
    createDraft.mockResolvedValue({
      id: `env_${runId}`,
      status: "draft",
      pageCount: 1,
      signers: [{ id: "s1", name: "Ada Target", email: target.email, status: "created" }],
    });
    defaultFieldsFor.mockReturnValue([
      { signerId: "s1", type: "signature", page: 1, xPct: 12, yPct: 78, wPct: 38, hPct: 10 },
    ]);
    setFields.mockResolvedValue(undefined);
    send.mockResolvedValue({ id: `env_${runId}`, status: "sent", signers: [] });
    getPdf.mockResolvedValue(Buffer.from("%PDF-1.4 signed"));
  });

  test("preview creates a draft and does not send; send is explicit; outsider is 403", async () => {
    session({ email: outsider.email, employeeId: outsider.id, role: "employee" });
    const forbidden = await preview(
      new NextRequest(`http://localhost/api/documents/${documentId}/signature-requests`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: String(documentId) }) }
    );
    expect(forbidden.status).toBe(403);
    expect(createDraft).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();

    session({ email: admin.email, employeeId: admin.id, role: "full_admin" });
    const res = await preview(
      new NextRequest(`http://localhost/api/documents/${documentId}/signature-requests`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: String(documentId) }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(false);
    expect(body.preview.signerEmail).toBe(target.email);
    expect(body.request.status).toBe("draft");
    ids.requests.push(body.request.id);
    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();

    const sendRes = await sendRoute(
      new NextRequest(`http://localhost/api/signature-requests/${body.request.id}/send`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: String(body.request.id) }) }
    );
    expect(sendRes.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    const sentBody = await sendRes.json();
    expect(sentBody.sent).toBe(true);
    expect(sentBody.request.status).toBe("sent");
  });

  test("completed webhook stores signed status without calling send", async () => {
    send.mockClear();
    const [request] = await db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.documentId, documentId))
      .limit(1);
    expect(request).toBeTruthy();

    await applyVsignWebhook(
      {
        event: "envelope.completed",
        envelopeId: request.vsignEnvelopeId!,
        status: "completed",
        signers: [{ email: target.email, status: "signed" }],
      },
      { client: createVsignClient() }
    );

    const [updated] = await db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.id, request.id))
      .limit(1);
    expect(updated.status).toBe("signed");
    expect(send).not.toHaveBeenCalled();
  });
});
