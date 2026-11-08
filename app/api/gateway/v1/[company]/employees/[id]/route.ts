import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, departments, divisions, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateApiKey } from "@/lib/api-auth";
import { formatBambooEmployee } from "@/lib/bamboo-api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ company: string; id: string }> }
) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Valid API key required" },
      { status: 401 }
    );
  }

  const { id } = await params;
  const employeeId = parseInt(id);

  if (isNaN(employeeId)) {
    return NextResponse.json({ error: "Invalid employee ID" }, { status: 400 });
  }

  const searchParams = request.nextUrl.searchParams;
  const fields = searchParams.get("fields");

  const [employee] = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      preferredName: employees.preferredName,
      email: employees.email,
      workPhone: employees.workPhone,
      extension: employees.extension,
      mobilePhone: employees.mobilePhone,
      homePhone: employees.homePhone,
      personalEmail: employees.personalEmail,
      jobTitle: employees.jobTitle,
      hireDate: employees.hireDate,
      terminationDate: employees.terminationDate,
      employmentStatus: employees.employmentStatus,
      photoUrl: employees.photoUrl,
      birthDate: employees.birthDate,
      gender: employees.gender,
      maritalStatus: employees.maritalStatus,
      nationality: employees.nationality,
      addressStreet1: employees.addressStreet1,
      addressStreet2: employees.addressStreet2,
      addressCity: employees.addressCity,
      addressProvince: employees.addressProvince,
      addressPostalCode: employees.addressPostalCode,
      addressCountry: employees.addressCountry,
      departmentId: employees.departmentId,
      divisionId: employees.divisionId,
      locationId: employees.locationId,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const [dept] = employee.departmentId
    ? await db.select().from(departments).where(eq(departments.id, employee.departmentId)).limit(1)
    : [null];

  const [div] = employee.divisionId
    ? await db.select().from(divisions).where(eq(divisions.id, employee.divisionId)).limit(1)
    : [null];

  const [loc] = employee.locationId
    ? await db.select().from(locations).where(eq(locations.id, employee.locationId)).limit(1)
    : [null];

  const employeeData = {
    ...employee,
    departmentName: dept?.name,
    divisionName: div?.name,
    locationName: loc?.name,
  };

  return NextResponse.json(formatBambooEmployee(employeeData, fields || undefined));
}
