import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { head } from "@vercel/blob";

export async function GET(
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

    // Check permissions: user must be the employee or an admin
    const [employee] = await db
      .select({ id: employees.id, accessLevel: employees.accessLevel })
      .from(employees)
      .where(eq(employees.email, session.user.email))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee record not found" },
        { status: 404 }
      );
    }

    const isAdmin = employee.accessLevel === "full_admin";
    const isOwner = employee.id === document.employeeId;

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        { error: "You do not have permission to access this document" },
        { status: 403 }
      );
    }

    // Generate signed download URL for private blob
    if (!document.fileUrl) {
      return NextResponse.json({
        url: null,
        expiresAt: null,
      });
    }

    try {
      const blobInfo = await head(document.fileUrl);
      return NextResponse.json({
        url: blobInfo.downloadUrl,
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      });
    } catch (blobError) {
      console.error("Failed to generate signed URL:", blobError);
      // Return null if blob doesn't exist yet (e.g., seeded placeholder)
      return NextResponse.json({
        url: null,
        expiresAt: null,
      });
    }
  } catch (error: any) {
    console.error("Document download failed:", error);
    return NextResponse.json(
      { error: "Download failed", message: error.message },
      { status: 500 }
    );
  }
}
