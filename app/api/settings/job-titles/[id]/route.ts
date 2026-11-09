import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, jobTitles } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { canWriteSettings } from "@/lib/authz";

async function requireSettingsAdmin(employeeId: number) {
  const [actor] = await db
    .select({ accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return canWriteSettings(actor?.accessLevel);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.employeeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await requireSettingsAdmin(session.user.employeeId))) {
      return NextResponse.json(
        { error: "Only full admins can update job titles" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const jobTitleId = parseInt(id);
    const body = await request.json();
    const { title, description, department } = body;

    const [jobTitle] = await db
      .update(jobTitles)
      .set({
        title,
        description: description ?? null,
        department: department ?? null,
        updatedAt: new Date(),
      })
      .where(eq(jobTitles.id, jobTitleId))
      .returning();

    if (!jobTitle) {
      return NextResponse.json({ error: "Job title not found" }, { status: 404 });
    }

    return NextResponse.json({ jobTitle });
  } catch (error: any) {
    console.error("Failed to update job title:", error);
    return NextResponse.json(
      { error: "Failed to update job title", message: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.employeeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await requireSettingsAdmin(session.user.employeeId))) {
      return NextResponse.json(
        { error: "Only full admins can delete job titles" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const jobTitleId = parseInt(id);

    await db.delete(jobTitles).where(eq(jobTitles.id, jobTitleId));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete job title:", error);
    return NextResponse.json(
      { error: "Failed to delete job title", message: error.message },
      { status: 500 }
    );
  }
}
