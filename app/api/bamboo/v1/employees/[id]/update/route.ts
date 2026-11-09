import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateApiKey } from "@/lib/api-auth";
import { sanitizePersonNameFields, UNSAFE_PERSON_NAME_MESSAGE } from "@/lib/person-name";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid API key required" },
      { status: 401 }
    );
  }

  // Check permissions
  if (!auth.permissions.canEditCompensation && !auth.permissions.canManageSettings) {
    return NextResponse.json(
      { error: "Forbidden", message: "Insufficient permissions" },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const employeeId = parseInt(id);
    const data = sanitizePersonNameFields(await request.json());

    // Build update object (only allow specific fields)
    const updateData: any = { updatedAt: new Date() };

    if (data.firstName) updateData.firstName = data.firstName;
    if (data.lastName) updateData.lastName = data.lastName;
    if (data.jobTitle) updateData.jobTitle = data.jobTitle;
    if (data.departmentId) updateData.departmentId = data.departmentId;
    if (data.locationId) updateData.locationId = data.locationId;
    if (data.workPhone) updateData.workPhone = data.workPhone;
    if (data.mobilePhone) updateData.mobilePhone = data.mobilePhone;
    if (data.addressStreet1) updateData.addressStreet1 = data.addressStreet1;
    if (data.addressCity) updateData.addressCity = data.addressCity;
    if (data.addressProvince) updateData.addressProvince = data.addressProvince;
    if (data.addressPostalCode) updateData.addressPostalCode = data.addressPostalCode;
    if (data.addressCountry) updateData.addressCountry = data.addressCountry;

    const [updated] = await db
      .update(employees)
      .set(updateData)
      .where(eq(employees.id, employeeId))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: updated.id.toString(),
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      jobTitle: updated.jobTitle,
    });
  } catch (error: any) {
    if (error?.message === UNSAFE_PERSON_NAME_MESSAGE) {
      return NextResponse.json({ error: UNSAFE_PERSON_NAME_MESSAGE }, { status: 400 });
    }
    console.error("Failed to update employee:", error);
    return NextResponse.json(
      { error: "Failed to update employee", message: error.message },
      { status: 500 }
    );
  }
}
