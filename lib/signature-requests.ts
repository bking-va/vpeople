import { put } from "@vercel/blob";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, employees, signatureRequests, auditLogs } from "@/lib/db/schema";
import { canViewEmployeeDocument } from "@/lib/document-access";
import { canManageAccessScopes } from "@/lib/access-scopes";
import { employeeInScope, scopedEmployeeIds } from "@/lib/employee-scope";
import {
  canViewIssuedLetterBody,
  isVendastaWorkEmail,
  visibleProfileEmail,
  type AccessLevel,
} from "@/lib/authz";
import { getStoredPrivateBlob } from "@/lib/bamboo-sync/blob";
import { letterBodyToPdf, LetterPdfEncodingError } from "@/lib/letter-pdf";
import {
  createVsignClient,
  isVsignConfigured,
  vsignCallbackUrl,
  VsignNotConfiguredError,
  type VsignClient,
} from "@/lib/vsign/client";
import {
  ACTIVE_SIGNATURE_STATUSES,
  isVsignWebhookEvent,
  statusFromWebhookEvent,
  type SignatureRequestStatus,
  type VsignWebhookEvent,
} from "@/lib/vsign/status";
import type { getSessionUserPermissions } from "@/lib/permissions";

export type SignatureActor = {
  id: number;
  email: string;
  accessLevel: AccessLevel;
  canManageUsers?: boolean;
};

type Permissions = Awaited<ReturnType<typeof getSessionUserPermissions>>;

export function canRequestSignature(actor: SignatureActor, permissions: Permissions): boolean {
  return canManageAccessScopes({
    employeeId: actor.id,
    accessLevel: actor.accessLevel,
    canManageUsers: permissions.canManageUsers,
  });
}

function assertCanViewCompensationDocument(
  actor: SignatureActor,
  permissions: Permissions,
  document: { employeeId: number; containsCompensation: boolean }
) {
  if (
    !canViewIssuedLetterBody({
      isRecipient: actor.id === document.employeeId,
      containsCompensation: Boolean(document.containsCompensation),
      canViewCompensation: permissions.canViewCompensation === true,
    })
  ) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
}

export function signatureRequestForViewer(
  request: {
    employeeId: number;
    signerEmail: string;
    senderEmail: string;
  },
  opts: { viewerId: number; canViewSensitivePersonalInfo: boolean }
) {
  return {
    signerEmail: visibleProfileEmail(request.signerEmail, {
      isViewingSelf: opts.viewerId === request.employeeId,
      canViewSensitivePersonalInfo: opts.canViewSensitivePersonalInfo,
    }),
    senderEmail: visibleProfileEmail(request.senderEmail, {
      isViewingSelf: opts.viewerId === request.employeeId,
      canViewSensitivePersonalInfo: opts.canViewSensitivePersonalInfo,
    }),
  };
}

export function assertVendastaSender(email: string): string {
  const trimmed = email.trim().toLowerCase();
  if (!isVendastaWorkEmail(trimmed)) {
    throw Object.assign(new Error("Sender must be a @vendasta.com address"), {
      status: 400,
    });
  }
  return trimmed;
}

function displayName(row: {
  firstName: string;
  lastName: string;
  preferredName: string | null;
}): string {
  return row.preferredName
    ? `${row.preferredName} ${row.lastName}`
    : `${row.firstName} ${row.lastName}`;
}

function safeFileName(title: string, fallbackExt: string): string {
  const safe = title.trim().replace(/[^\w.-]+/g, "_") || "document";
  if (/\.[A-Za-z0-9]{2,8}$/.test(safe)) return safe;
  return `${safe}.${fallbackExt}`;
}

async function documentBytes(document: {
  title: string;
  body: string | null;
  fileUrl: string | null;
}): Promise<{ bytes: Buffer; fileName: string }> {
  if (document.fileUrl) {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw Object.assign(new Error("Document file is not available"), { status: 503 });
    }
    const stored = await getStoredPrivateBlob(document.fileUrl, token);
    if (!stored) {
      throw Object.assign(new Error("Document file is not available"), { status: 404 });
    }
    const chunks: Uint8Array[] = [];
    const reader = stored.stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const bytes = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { bytes, fileName: safeFileName(document.title, "pdf") };
  }
  if (document.body) {
    try {
      return {
        bytes: letterBodyToPdf(document.title, document.body),
        fileName: safeFileName(document.title, "pdf"),
      };
    } catch (error) {
      if (error instanceof LetterPdfEncodingError) {
        throw Object.assign(error, { status: 400 });
      }
      throw error;
    }
  }
  throw Object.assign(new Error("Document has no file or letter body to send"), {
    status: 400,
  });
}

export async function previewSignatureRequest(opts: {
  actor: SignatureActor;
  permissions: Permissions;
  documentId: number;
  client?: VsignClient;
}): Promise<{
  request: typeof signatureRequests.$inferSelect;
  preview: {
    title: string;
    senderEmail: string;
    signerEmail: string;
    signerName: string;
    envelopeId: string;
    status: SignatureRequestStatus;
  };
}> {
  if (!isVsignConfigured() && !opts.client) {
    throw Object.assign(new VsignNotConfiguredError(), { status: 503 });
  }
  if (!canRequestSignature(opts.actor, opts.permissions)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  const senderEmail = assertVendastaSender(opts.actor.email);

  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, opts.documentId))
    .limit(1);
  if (!document) {
    throw Object.assign(new Error("Document not found"), { status: 404 });
  }
  if (document.bambooId) {
    throw Object.assign(new Error("BambooHR is the system of record for this document"), {
      status: 409,
    });
  }
  if (
    !canViewEmployeeDocument({
      viewerId: opts.actor.id,
      accessLevel: opts.actor.accessLevel,
      canManageUsers: opts.permissions.canManageUsers,
      document,
    })
  ) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  assertCanViewCompensationDocument(opts.actor, opts.permissions, document);

  const allowed = await scopedEmployeeIds({
    employeeId: opts.actor.id,
    accessLevel: opts.actor.accessLevel,
    canManageUsers: opts.permissions.canManageUsers,
  });
  if (!employeeInScope(document.employeeId, allowed)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  const [employee] = await db
    .select({
      id: employees.id,
      email: employees.email,
      firstName: employees.firstName,
      lastName: employees.lastName,
      preferredName: employees.preferredName,
    })
    .from(employees)
    .where(eq(employees.id, document.employeeId))
    .limit(1);
  if (!employee?.email) {
    throw Object.assign(new Error("Employee email is required to send for signature"), {
      status: 400,
    });
  }

  const existing = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.documentId, document.id));
  const active = existing.find((row) =>
    ACTIVE_SIGNATURE_STATUSES.includes(row.status as (typeof ACTIVE_SIGNATURE_STATUSES)[number])
  );
  if (active?.status === "sent" || active?.status === "viewed") {
    throw Object.assign(new Error("A signature request is already outstanding for this document"), {
      status: 409,
    });
  }
  if (active?.status === "draft" && active.vsignEnvelopeId) {
    const emails = signatureRequestForViewer(active, {
      viewerId: opts.actor.id,
      canViewSensitivePersonalInfo: opts.permissions.canViewSensitivePersonalInfo === true,
    });
    return {
      request: active,
      preview: {
        title: document.title,
        senderEmail: emails.senderEmail ?? "",
        signerEmail: emails.signerEmail ?? "",
        signerName: active.signerName,
        envelopeId: active.vsignEnvelopeId,
        status: "draft",
      },
    };
  }

  const { bytes, fileName } = await documentBytes(document);
  const client = opts.client ?? createVsignClient();
  const envelope = await client.createDraft(senderEmail, {
    title: document.title,
    signerName: displayName(employee),
    signerEmail: employee.email,
    fileName,
    fileBytes: bytes,
    callbackUrl: vsignCallbackUrl(),
  });
  const fields = client.defaultFieldsFor(envelope);
  await client.setFields(senderEmail, envelope.id, fields);

  const now = new Date();
  const [request] = await db
    .insert(signatureRequests)
    .values({
      documentId: document.id,
      employeeId: document.employeeId,
      requestedBy: opts.actor.id,
      vsignEnvelopeId: envelope.id,
      status: "draft",
      senderEmail,
      signerEmail: employee.email,
      signerName: displayName(employee),
      previewedAt: now,
      updatedAt: now,
    })
    .returning();

  if (document.status === "draft") {
    await db
      .update(documents)
      .set({ status: "pending_signature", updatedAt: now })
      .where(eq(documents.id, document.id));
  }

  await db.insert(auditLogs).values({
    employeeId: opts.actor.id,
    action: "signature_request_previewed",
    entityType: "signature_request",
    entityId: String(request.id),
    changes: {
      documentId: document.id,
      envelopeId: envelope.id,
      signerEmail: employee.email,
    },
  });

  const emails = signatureRequestForViewer(request, {
    viewerId: opts.actor.id,
    canViewSensitivePersonalInfo: opts.permissions.canViewSensitivePersonalInfo === true,
  });
  return {
    request,
    preview: {
      title: document.title,
      senderEmail: emails.senderEmail ?? senderEmail,
      signerEmail: emails.signerEmail ?? "",
      signerName: displayName(employee),
      envelopeId: envelope.id,
      status: "draft",
    },
  };
}

export async function sendSignatureRequest(opts: {
  actor: SignatureActor;
  permissions: Permissions;
  requestId: number;
  client?: VsignClient;
}): Promise<typeof signatureRequests.$inferSelect> {
  if (!isVsignConfigured() && !opts.client) {
    throw Object.assign(new VsignNotConfiguredError(), { status: 503 });
  }
  if (!canRequestSignature(opts.actor, opts.permissions)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  const senderEmail = assertVendastaSender(opts.actor.email);

  const [request] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.id, opts.requestId))
    .limit(1);
  if (!request) {
    throw Object.assign(new Error("Signature request not found"), { status: 404 });
  }
  if (request.status !== "draft" || !request.previewedAt || !request.vsignEnvelopeId) {
    throw Object.assign(
      new Error("Preview this request before sending. Nothing is sent automatically."),
      { status: 409 }
    );
  }
  if (request.requestedBy !== opts.actor.id) {
    throw Object.assign(new Error("Send as the HR user who previewed this request"), {
      status: 403,
    });
  }
  if (request.senderEmail.toLowerCase() !== senderEmail) {
    throw Object.assign(new Error("Send as the HR user who previewed this request"), {
      status: 403,
    });
  }

  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, request.documentId))
    .limit(1);
  if (!document) {
    throw Object.assign(new Error("Document not found"), { status: 404 });
  }
  if (
    !canViewEmployeeDocument({
      viewerId: opts.actor.id,
      accessLevel: opts.actor.accessLevel,
      canManageUsers: opts.permissions.canManageUsers,
      document,
    })
  ) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  assertCanViewCompensationDocument(opts.actor, opts.permissions, document);
  const allowed = await scopedEmployeeIds({
    employeeId: opts.actor.id,
    accessLevel: opts.actor.accessLevel,
    canManageUsers: opts.permissions.canManageUsers,
  });
  if (!employeeInScope(document.employeeId, allowed)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  const client = opts.client ?? createVsignClient();
  await client.send(senderEmail, request.vsignEnvelopeId);

  const now = new Date();
  const [updated] = await db
    .update(signatureRequests)
    .set({
      status: "sent",
      sentAt: now,
      lastEventType: "envelope.sent",
      lastEventAt: now,
      updatedAt: now,
    })
    .where(eq(signatureRequests.id, request.id))
    .returning();

  await db
    .update(documents)
    .set({ status: "pending_signature", updatedAt: now })
    .where(eq(documents.id, document.id));

  await db.insert(auditLogs).values({
    employeeId: opts.actor.id,
    action: "signature_request_sent",
    entityType: "signature_request",
    entityId: String(request.id),
    changes: {
      documentId: document.id,
      envelopeId: request.vsignEnvelopeId,
      signerEmail: request.signerEmail,
    },
  });

  return updated;
}

export type VsignWebhookPayload = {
  event: string;
  envelopeId: string;
  status: string;
  occurredAt?: string;
  signers?: {
    email: string;
    status: string;
    viewedAt?: string | null;
    signedAt?: string | null;
    declinedAt?: string | null;
  }[];
};

async function storeCompletedPdf(opts: {
  request: typeof signatureRequests.$inferSelect;
  document: typeof documents.$inferSelect;
  pdf: Buffer;
}): Promise<{ signedPdfUrl: string; certificateUrl: string }> {
  const blob = await put(
    `signatures/${opts.request.employeeId}/${opts.request.id}-completed.pdf`,
    opts.pdf,
    { access: "private", addRandomSuffix: true, contentType: "application/pdf" }
  );
  const now = new Date();
  await db
    .update(documents)
    .set({
      fileUrl: blob.url,
      status: "signed",
      signedAt: now,
      signedBy: opts.request.employeeId,
      updatedAt: now,
    })
    .where(eq(documents.id, opts.document.id));
  return { signedPdfUrl: blob.url, certificateUrl: blob.url };
}

export async function applyVsignWebhook(
  payload: VsignWebhookPayload,
  opts?: { client?: VsignClient }
): Promise<{ handled: boolean; requestId?: number }> {
  if (!isVsignWebhookEvent(payload.event)) {
    return { handled: false };
  }
  const event: VsignWebhookEvent = payload.event;
  if (!payload.envelopeId) {
    return { handled: false };
  }

  const [request] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.vsignEnvelopeId, payload.envelopeId))
    .limit(1);
  if (!request) {
    return { handled: false };
  }

  const nextStatus = statusFromWebhookEvent(event);
  if (
    (request.status === "signed" ||
      request.status === "declined" ||
      request.status === "voided") &&
    (nextStatus === "draft" || nextStatus === "sent" || nextStatus === "viewed")
  ) {
    return { handled: true, requestId: request.id };
  }
  const now = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
  const patch: Partial<typeof signatureRequests.$inferInsert> = {
    status: nextStatus,
    lastEventType: event,
    lastEventAt: now,
    updatedAt: new Date(),
  };
  if (nextStatus === "sent" && !request.sentAt) patch.sentAt = now;
  if (nextStatus === "viewed") patch.viewedAt = now;
  if (nextStatus === "signed" || nextStatus === "declined" || nextStatus === "voided") {
    patch.completedAt = now;
  }

  if (nextStatus === "signed" && !request.signedPdfUrl) {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, request.documentId))
      .limit(1);
    if (!document || !request.vsignEnvelopeId) {
      throw Object.assign(new Error("Completed envelope has no document to store"), {
        status: 500,
      });
    }
    const client = opts?.client ?? createVsignClient();
    const pdf = await client.getPdf(request.senderEmail, request.vsignEnvelopeId);
    const stored = await storeCompletedPdf({ request, document, pdf });
    patch.signedPdfUrl = stored.signedPdfUrl;
    patch.certificateUrl = stored.certificateUrl;
  }

  await db
    .update(signatureRequests)
    .set(patch)
    .where(eq(signatureRequests.id, request.id));

  if (nextStatus === "signed") {
    await db.insert(auditLogs).values({
      employeeId: request.requestedBy,
      action: "signature_request_completed",
      entityType: "signature_request",
      entityId: String(request.id),
      changes: {
        documentId: request.documentId,
        envelopeId: request.vsignEnvelopeId,
        event,
      },
    });
  }

  return { handled: true, requestId: request.id };
}

export async function latestRequestsByDocumentIds(documentIds: number[]) {
  if (documentIds.length === 0) return new Map<number, typeof signatureRequests.$inferSelect>();
  const rows = await db
    .select()
    .from(signatureRequests)
    .where(inArray(signatureRequests.documentId, documentIds));
  const latest = new Map<number, typeof signatureRequests.$inferSelect>();
  for (const row of rows) {
    const prev = latest.get(row.documentId);
    if (!prev || row.id > prev.id) latest.set(row.documentId, row);
  }
  return latest;
}
