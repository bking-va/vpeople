import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { enpsSurveys, enpsSurveyParticipants, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [employee] = await db
    .select({ accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.email, session.user.email))
    .limit(1);

  if (!employee || employee.accessLevel !== "full_admin") {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  try {
    const data = await request.json();

    const [survey] = await db
      .insert(enpsSurveys)
      .values({
        name: data.name,
        question: data.question,
        isActive: true,
      })
      .returning();

    // Create participant records for all active employees
    const allEmployees = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.employmentStatus, "full_time"));

    if (allEmployees.length > 0) {
      await db.insert(enpsSurveyParticipants).values(
        allEmployees.map((emp) => ({
          surveyId: survey.id,
          employeeId: emp.id,
          hasResponded: false,
        }))
      );
    }

    return NextResponse.json({ survey });
  } catch (error: any) {
    console.error("Failed to create survey:", error);
    return NextResponse.json(
      { error: "Failed to create survey", message: error.message },
      { status: 500 }
    );
  }
}
