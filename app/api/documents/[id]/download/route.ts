import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

    // Stream the file through this route using server-side token
    if (!document.fileUrl) {
      return NextResponse.json(
        { error: "Document file not available" },
        { status: 404 }
      );
    }

    // Fetch blob with server-side token and stream to client
    const blobResponse = await fetch(document.fileUrl, {
      headers: {
        Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
      },
    });

    if (!blobResponse.ok) {
      console.error("Blob fetch failed:", blobResponse.status);
      return NextResponse.json(
        { error: "Document file not available" },
        { status: 404 }
      );
    }

    // Get filename from document or blob URL
    const filename = document.title || "download";
    const contentType = blobResponse.headers.get("content-type") || "application/octet-stream";

    // Stream response with proper headers
    return new NextResponse(blobResponse.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (error: any) {
    console.error("Document download failed:", error);
    return NextResponse.json(
      { error: "Download failed", message: error.message },
      { status: 500 }
    );
  }
}
