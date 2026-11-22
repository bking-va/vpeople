import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUserPermissions } from "@/lib/permissions";
import { previewSignatureRequest, signatureRequestForViewer } from "@/lib/signature-requests";
import { httpErrorMessage, httpErrorStatus } from "@/lib/http-error";
import type { AccessLevel } from "@/lib/authz";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const documentId = parseInt(idStr, 10);
  if (!Number.isFinite(documentId)) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const [actor] = await db
    .select({
      id: employees.id,
      accessLevel: employees.accessLevel,
    })
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);
  if (!actor || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await getSessionUserPermissions(session);
  try {
    const result = await previewSignatureRequest({
      actor: {
        id: actor.id,
        email: session.user.email,
        accessLevel: actor.accessLevel as AccessLevel,
        canManageUsers: permissions.canManageUsers,
      },
      permissions,
      documentId,
    });
    return NextResponse.json({
      request: {
        ...result.request,
        ...signatureRequestForViewer(result.request, {
          viewerId: actor.id,
          canViewSensitivePersonalInfo: permissions.canViewSensitivePersonalInfo === true,
        }),
      },
      preview: result.preview,
      sent: false,
    });
  } catch (error) {
    const status = httpErrorStatus(error);
    return NextResponse.json(
      { error: httpErrorMessage(error, "Could not create signature preview") },
      { status: status === 500 ? 500 : status }
    );
  }
}
