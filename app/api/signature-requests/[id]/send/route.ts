import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUserPermissions } from "@/lib/permissions";
import { sendSignatureRequest } from "@/lib/signature-requests";
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
  const requestId = parseInt(idStr, 10);
  if (!Number.isFinite(requestId)) {
    return NextResponse.json({ error: "Signature request not found" }, { status: 404 });
  }

  const [actor] = await db
    .select({
      id: employees.id,
      email: employees.email,
      accessLevel: employees.accessLevel,
    })
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await getSessionUserPermissions(session);
  try {
    const request = await sendSignatureRequest({
      actor: {
        id: actor.id,
        email: actor.email,
        accessLevel: actor.accessLevel as AccessLevel,
        canManageUsers: permissions.canManageUsers,
      },
      permissions,
      requestId,
    });
    return NextResponse.json({ request, sent: true });
  } catch (error) {
    const status = httpErrorStatus(error);
    return NextResponse.json(
      { error: httpErrorMessage(error, "Could not send signature request") },
      { status: status === 500 ? 500 : status }
    );
  }
}
