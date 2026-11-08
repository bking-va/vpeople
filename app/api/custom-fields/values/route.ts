import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { customFieldValues, employees } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserPermissions } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get("entityId");

    if (!entityId) {
      return NextResponse.json({ error: "Entity ID required" }, { status: 400 });
    }

    const values = await db
      .select()
      .from(customFieldValues)
      .where(eq(customFieldValues.entityId, parseInt(entityId, 10)));

    return NextResponse.json({ values });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to fetch custom field values:", errorMessage);
    return NextResponse.json(
      { error: "Failed to fetch custom field values", message: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !session?.user?.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await request.json();
    const { customFieldId, entityId, value } = data;

    // Check permissions
    const permissions = await getUserPermissions(session.user.email);
    
    // User can edit their own profile or must have admin access
    const canEdit =
      entityId === session.user.employeeId || permissions.canManageUsers;

    if (!canEdit) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Check if value already exists
    const [existing] = await db
      .select()
      .from(customFieldValues)
      .where(
        and(
          eq(customFieldValues.customFieldId, customFieldId),
          eq(customFieldValues.entityId, entityId)
        )
      )
      .limit(1);

    let result;
    if (existing) {
      // Update existing value
      [result] = await db
        .update(customFieldValues)
        .set({ value: value || "" })
        .where(eq(customFieldValues.id, existing.id))
        .returning();
    } else {
      // Insert new value
      [result] = await db
        .insert(customFieldValues)
        .values({
          customFieldId,
          entityId,
          value: value || "",
        })
        .returning();
    }

    return NextResponse.json({ value: result });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to save custom field value:", errorMessage);
    return NextResponse.json(
      { error: "Failed to save custom field value", message: errorMessage },
      { status: 500 }
    );
  }
}
