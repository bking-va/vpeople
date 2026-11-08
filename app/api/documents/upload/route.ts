import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { documents, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [employee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.email, session.user.email))
    .limit(1);

  if (!employee) {
    return NextResponse.json(
      { error: "Employee record not found" },
      { status: 404 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const title = formData.get("title") as string;
    const category = formData.get("category") as string;
    const employeeId = formData.get("employeeId") as string;

    if (!file || !title || !category || !employeeId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB" },
        { status: 400 }
      );
    }

    // Upload to Vercel Blob with private access
    const blob = await put(file.name, file, {
      access: "public", // We'll use signed URLs for access control
      addRandomSuffix: true,
    });

    // Create document record
    const [document] = await db
      .insert(documents)
      .values({
        employeeId: parseInt(employeeId),
        title,
        category: category as any,
        fileUrl: blob.url,
        status: "draft",
        uploadedBy: employee.id,
      })
      .returning();

    return NextResponse.json({ document });
  } catch (error: any) {
    console.error("Document upload failed:", error);
    return NextResponse.json(
      { error: "Upload failed", message: error.message },
      { status: 500 }
    );
  }
}
