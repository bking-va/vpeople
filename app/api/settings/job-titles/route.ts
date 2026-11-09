import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, jobTitles } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { canWriteSettings } from "@/lib/authz";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.employeeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const titles = await db.select().from(jobTitles).orderBy(jobTitles.title);
    return NextResponse.json({ jobTitles: titles });
  } catch (error: any) {
    console.error("Failed to fetch job titles:", error);
    return NextResponse.json(
      { error: "Failed to fetch job titles", message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.employeeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [actor] = await db
      .select({ accessLevel: employees.accessLevel })
      .from(employees)
      .where(eq(employees.id, session.user.employeeId))
      .limit(1);
    if (!canWriteSettings(actor?.accessLevel)) {
      return NextResponse.json(
        { error: "Only full admins can create job titles" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, department } = body;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const [jobTitle] = await db
      .insert(jobTitles)
      .values({
        title,
        description: description || null,
        department: department || null,
      })
      .returning();

    return NextResponse.json({ jobTitle }, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create job title:", error);
    return NextResponse.json(
      { error: "Failed to create job title", message: error.message },
      { status: 500 }
    );
  }
}
