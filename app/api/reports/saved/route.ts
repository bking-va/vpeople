import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { savedReports, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, session.user.email))
      .limit(1);

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Get user's reports + shared reports
    const reports = await db
      .select()
      .from(savedReports)
      .where(eq(savedReports.userId, employee.id));

    return NextResponse.json({ reports });
  } catch (error: any) {
    console.error("Failed to fetch saved reports:", error);
    return NextResponse.json(
      { error: "Failed to fetch reports", message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, session.user.email))
      .limit(1);

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, fields, filters, groupBy, sortBy, sortOrder, isShared } = body;

    if (!name || !fields) {
      return NextResponse.json(
        { error: "Name and fields are required" },
        { status: 400 }
      );
    }

    const [report] = await db
      .insert(savedReports)
      .values({
        userId: employee.id,
        name,
        description: description || null,
        reportType: "custom",
        fields: JSON.stringify(fields),
        filters: filters ? JSON.stringify(filters) : null,
        groupBy: groupBy || null,
        sortBy: sortBy || null,
        sortOrder: sortOrder || "asc",
        isShared: isShared || false,
      })
      .returning();

    return NextResponse.json({ report });
  } catch (error: any) {
    console.error("Failed to save report:", error);
    return NextResponse.json(
      { error: "Failed to save report", message: error.message },
      { status: 500 }
    );
  }
}
