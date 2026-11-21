import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { customFields, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUserPermissions } from "@/lib/permissions";
import { canViewCustomFieldValue } from "@/lib/authz";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const permissions = await getSessionUserPermissions(session);
    const entityId = request.nextUrl.searchParams.get("entityId");
    const targetEmployeeId = entityId ? parseInt(entityId, 10) : NaN;
    const isViewingSelf =
      Number.isFinite(targetEmployeeId) &&
      session.user.employeeId === targetEmployeeId;
    let isManager = false;
    if (Number.isFinite(targetEmployeeId)) {
      const [target] = await db
        .select({ managerId: employees.managerId })
        .from(employees)
        .where(eq(employees.id, targetEmployeeId))
        .limit(1);
      isManager = target?.managerId === session.user.employeeId;
    }

    const allFields = await db
      .select()
      .from(customFields)
      .orderBy(customFields.section, customFields.orderIndex);

    const fields = allFields.filter((field) =>
      canViewCustomFieldValue({
        field,
        isViewingSelf,
        isManager,
        isHROrAdmin: permissions.canManageUsers,
        canViewCompensation: permissions.canViewCompensation,
        canViewSensitivePersonalInfo: permissions.canViewSensitivePersonalInfo,
      })
    );

    return NextResponse.json({ fields });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to fetch custom fields:", errorMessage);
    return NextResponse.json(
      { error: "Failed to fetch custom fields", message: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check permissions
    const [currentEmployee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, session.user.employeeId))
      .limit(1);

    if (!currentEmployee || currentEmployee.accessLevel !== "full_admin") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const data = await request.json();
    const {
      name,
      fieldType,
      entityType,
      section,
      options,
      isRequired,
      orderIndex,
      visibility,
    } = data;

    const [field] = await db
      .insert(customFields)
      .values({
        name,
        fieldType,
        entityType: entityType || "employee",
        section: section || "personal",
        options: options ? JSON.stringify(options) : null,
        isRequired: isRequired || false,
        orderIndex: orderIndex || 0,
        visibility: visibility || "everyone",
      })
      .returning();

    return NextResponse.json({ field });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to create custom field:", errorMessage);
    return NextResponse.json(
      { error: "Failed to create custom field", message: errorMessage },
      { status: 500 }
    );
  }
}
