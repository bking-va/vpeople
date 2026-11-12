import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  employees,
  letterTemplates,
  documents,
  auditLogs,
  departments,
  locations,
  compensationHistory,
} from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getSessionUserPermissions } from "@/lib/permissions";
import { canManageAccessScopes } from "@/lib/access-scopes";
import {
  employeeInScope,
  scopedEmployeeIds,
} from "@/lib/employee-scope";
import {
  ISSUED_LETTER_STATUS,
  buildLetterMergeValues,
  issuedLetterContainsCompensation,
  rejectClientMergeOverrides,
  renderLetter,
} from "@/lib/letter-issue";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email || !session.user.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const templateId = parseInt(idStr, 10);
  if (!Number.isFinite(templateId)) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const data = (await request.json()) as Record<string, unknown>;
  const overrideError = rejectClientMergeOverrides(data);
  if (overrideError) {
    return NextResponse.json({ error: overrideError }, { status: 400 });
  }

  const targetEmployeeId = parseInt(String(data.employeeId), 10);
  if (!Number.isFinite(targetEmployeeId)) {
    return NextResponse.json({ error: "employeeId required" }, { status: 400 });
  }

  const [actor] = await db
    .select({
      id: employees.id,
      accessLevel: employees.accessLevel,
    })
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await getSessionUserPermissions(session);
  if (
    !canManageAccessScopes({
      employeeId: actor.id,
      accessLevel: actor.accessLevel,
      canManageUsers: permissions.canManageUsers,
    })
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowed = await scopedEmployeeIds({
    employeeId: actor.id,
    accessLevel: actor.accessLevel,
    canManageUsers: permissions.canManageUsers,
  });
  if (!employeeInScope(targetEmployeeId, allowed)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [template] = await db
    .select()
    .from(letterTemplates)
    .where(eq(letterTemplates.id, templateId))
    .limit(1);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const [target] = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      preferredName: employees.preferredName,
      jobTitle: employees.jobTitle,
      hireDate: employees.hireDate,
      originalHireDate: employees.originalHireDate,
      employeeNumber: employees.employeeNumber,
      managerId: employees.managerId,
      departmentName: departments.name,
      locationName: locations.name,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(locations, eq(employees.locationId, locations.id))
    .where(eq(employees.id, targetEmployeeId))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  let managerName: string | null = null;
  if (target.managerId) {
    const [manager] = await db
      .select({ firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(eq(employees.id, target.managerId))
      .limit(1);
    managerName = manager ? `${manager.firstName} ${manager.lastName}` : null;
  }

  let payRate: string | null = null;
  if (permissions.canViewCompensation) {
    const [comp] = await db
      .select({ payRate: compensationHistory.payRate })
      .from(compensationHistory)
      .where(eq(compensationHistory.employeeId, target.id))
      .orderBy(desc(compensationHistory.effectiveDate), desc(compensationHistory.id))
      .limit(1);
    payRate = comp?.payRate ?? null;
  }

  const values = buildLetterMergeValues(
    {
      firstName: target.firstName,
      lastName: target.lastName,
      preferredName: target.preferredName,
      jobTitle: target.jobTitle,
      departmentName: target.departmentName,
      locationName: target.locationName,
      hireDate: target.hireDate,
      originalHireDate: target.originalHireDate,
      employeeNumber: target.employeeNumber,
      managerName,
      payRate,
    },
    { includePayRate: permissions.canViewCompensation }
  );
  const rendered = renderLetter(
    { subject: template.subject, body: template.body },
    values
  );

  const containsCompensation = issuedLetterContainsCompensation(template);
  const [document] = await db
    .insert(documents)
    .values({
      employeeId: target.id,
      title: rendered.subject || template.name,
      category: "letter",
      status: ISSUED_LETTER_STATUS,
      body: rendered.body,
      letterTemplateId: template.id,
      containsCompensation,
      uploadedBy: actor.id,
    })
    .returning();

  await db.insert(auditLogs).values({
    employeeId: actor.id,
    action: "letter_issued",
    entityType: "document",
    entityId: String(document.id),
    changes: {
      templateSlug: template.slug,
      targetEmployeeId: target.id,
      includedPayRate: Boolean(permissions.canViewCompensation && payRate),
    },
  });

  return NextResponse.json({ document });
}
