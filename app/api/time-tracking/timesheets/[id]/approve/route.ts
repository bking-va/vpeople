import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timesheets, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isFullAdmin, isManagerAccessLevel, isViewingAccessLevel } from "@/lib/authz";
import { getUserPermissions } from "@/lib/permissions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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

    if (isViewingAccessLevel(employee.accessLevel) || employee.accessLevel === "employee") {
      return NextResponse.json(
        { error: "You do not have permission to approve timesheets" },
        { status: 403 }
      );
    }

    const { id: idStr } = await params;
    const id = parseInt(idStr);
    const data = await request.json();
    const action = data.action;

    const [timesheet] = await db
      .select()
      .from(timesheets)
      .where(eq(timesheets.id, id))
      .limit(1);

    if (!timesheet) {
      return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
    }

    const permissions = await getUserPermissions(session.user.email);
    const [owner] = await db
      .select({ managerId: employees.managerId })
      .from(employees)
      .where(eq(employees.id, timesheet.employeeId))
      .limit(1);

    const inScope =
      isFullAdmin(employee.accessLevel) ||
      permissions.canManageUsers ||
      (isManagerAccessLevel(employee.accessLevel) && owner?.managerId === employee.id);

    if (!inScope) {
      return NextResponse.json(
        { error: "You do not have permission to approve this timesheet" },
        { status: 403 }
      );
    }

    const [updated] = await db
      .update(timesheets)
      .set({
        status: action === "approve" ? "approved" : "rejected",
        reviewedBy: employee.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(timesheets.id, id))
      .returning();

    return NextResponse.json({ timesheet: updated });
  } catch (error: any) {
    console.error("Failed to review timesheet:", error);
    return NextResponse.json(
      { error: "Failed to review timesheet", message: error.message },
      { status: 500 }
    );
  }
}
