import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUserPermissions } from "@/lib/permissions";
import { canViewEmployeeDocument } from "@/lib/document-access";
import { getStoredPrivateBlob } from "@/lib/bamboo-sync/blob";
import { canViewIssuedLetterBody, type AccessLevel } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const viewerId = session?.user?.employeeId;
  if (!viewerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const [employee] = await db
      .select({ id: employees.id, accessLevel: employees.accessLevel })
      .from(employees)
      .where(eq(employees.id, viewerId))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee record not found" },
        { status: 404 }
      );
    }

    const permissions = await getSessionUserPermissions(session);
    const allowed = canViewEmployeeDocument({
      viewerId: employee.id,
      accessLevel: employee.accessLevel as AccessLevel,
      canManageUsers: permissions.canManageUsers,
      document: {
        employeeId: document.employeeId,
        restricted: Boolean(document.restricted),
        containsCompensation: Boolean(document.containsCompensation),
      },
    });

    if (
      !allowed ||
      !canViewIssuedLetterBody({
        isRecipient: employee.id === document.employeeId,
        containsCompensation: Boolean(document.containsCompensation),
        canViewCompensation: permissions.canViewCompensation === true,
      })
    ) {
      return NextResponse.json(
        { error: "You do not have permission to access this document" },
        { status: 403 }
      );
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Document file not available" },
        { status: 404 }
      );
    }

    const stored = await getStoredPrivateBlob(document.fileUrl, token);
    if (!stored) {
      return NextResponse.json(
        { error: "Document file not available" },
        { status: 404 }
      );
    }

    const filename = (document.title || "download").replace(/["\\\r\n]+/g, "_");
    return new NextResponse(stored.stream, {
      headers: {
        "Content-Type": stored.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (error) {
    console.error("Document download failed:", error);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
