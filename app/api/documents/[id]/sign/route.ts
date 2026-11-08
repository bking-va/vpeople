import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, employees, auditLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    const data = await request.json();

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

    // Get employee ID
    const [employee] = await db
      .select({ id: employees.id, userId: employees.userId })
      .from(employees)
      .where(eq(employees.email, session.user.email))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee record not found" },
        { status: 404 }
      );
    }

    // Verify this employee can sign (must be the document owner)
    if (document.employeeId !== employee.id) {
      return NextResponse.json(
        { error: "You do not have permission to sign this document" },
        { status: 403 }
      );
    }

    // Update document with signature
    const [updated] = await db
      .update(documents)
      .set({
        status: "signed",
        signedAt: new Date(),
        signedBy: employee.id,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, id))
      .returning();

    // Audit log
    await db.insert(auditLogs).values({
      userId: employee.userId || session.user.id,
      action: "document_signed",
      entityType: "document",
      entityId: id.toString(),
      changes: JSON.stringify({
        documentId: id,
        title: document.title,
        signedBy: employee.id,
        signedAt: new Date().toISOString(),
      }),
    });

    return NextResponse.json({ document: updated });
  } catch (error: any) {
    console.error("Document signing failed:", error);
    return NextResponse.json(
      { error: "Signing failed", message: error.message },
      { status: 500 }
    );
  }
}
