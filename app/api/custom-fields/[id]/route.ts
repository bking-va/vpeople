import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { customFields, customFieldValues, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const fieldId = parseInt(resolvedParams.id, 10);

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

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (fieldType !== undefined) updateData.fieldType = fieldType;
    if (entityType !== undefined) updateData.entityType = entityType;
    if (section !== undefined) updateData.section = section;
    if (options !== undefined)
      updateData.options = options ? JSON.stringify(options) : null;
    if (isRequired !== undefined) updateData.isRequired = isRequired;
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex;
    if (visibility !== undefined) updateData.visibility = visibility;

    const [field] = await db
      .update(customFields)
      .set(updateData)
      .where(eq(customFields.id, fieldId))
      .returning();

    return NextResponse.json({ field });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to update custom field:", errorMessage);
    return NextResponse.json(
      { error: "Failed to update custom field", message: errorMessage },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const fieldId = parseInt(resolvedParams.id, 10);

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

    // Delete all values for this field first
    await db
      .delete(customFieldValues)
      .where(eq(customFieldValues.customFieldId, fieldId));

    // Delete the field
    await db.delete(customFields).where(eq(customFields.id, fieldId));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to delete custom field:", errorMessage);
    return NextResponse.json(
      { error: "Failed to delete custom field", message: errorMessage },
      { status: 500 }
    );
  }
}
