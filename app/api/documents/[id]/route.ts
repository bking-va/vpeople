import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents, auditLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getSessionUserPermissions } from "@/lib/permissions";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const documentId = parseInt(resolvedParams.id, 10);

    if (isNaN(documentId)) {
      return NextResponse.json({ error: "Invalid document ID" }, { status: 400 });
    }

    // Fetch the document
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const permissions = await getSessionUserPermissions(session);
    const employeeId = session.user.employeeId;
    const isOwner = employeeId && document.employeeId === employeeId;
    const canDelete = isOwner || permissions.canManageUsers;

    if (!canDelete) {
      return NextResponse.json(
        { error: "You do not have permission to delete this document" },
        { status: 403 }
      );
    }

    // Delete the blob if it exists
    if (document.fileUrl) {
      try {
        const { del } = await import("@vercel/blob");
        await del(document.fileUrl);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Tolerate blob deletion failures (e.g. 404 not found)
        console.warn(`Blob deletion warning for ${document.fileUrl}:`, errorMessage);
      }
    }

    // Delete the document record
    await db.delete(documents).where(eq(documents.id, documentId));

    // Audit log
    await db.insert(auditLogs).values({
      action: "delete",
      entityType: "document",
      entityId: String(documentId),
      employeeId: session.user.employeeId,
      changes: {
        title: document.title,
        category: document.category,
        employeeId: document.employeeId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Document deletion error:", errorMessage);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
