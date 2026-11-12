import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  employees,
  employeeTasks,
  taskTemplates,
  auditLogs,
  candidates,
} from "@/lib/db/schema";
import { recordEmploymentStatusChange } from "@/lib/employment-status";
import { eq, sql } from "drizzle-orm";
import { sanitizePersonNameFields, UNSAFE_PERSON_NAME_MESSAGE } from "@/lib/person-name";
import { getSessionUserPermissions } from "@/lib/permissions";
import { hiringAccessForCandidate } from "@/lib/hiring-access";
import {
  canOpenEmployeeCreate,
  resolveCreatedAccessLevel,
} from "@/lib/hire-employee";
import { isFullAdmin } from "@/lib/authz";
import { employeeInScope, scopedEmployeeIds } from "@/lib/employee-scope";

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  const message = error instanceof Error ? error.message : String(error);
  return code === "23505" || /unique|duplicate/i.test(message);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const employeeId = session.user.employeeId;
    if (!employeeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [currentEmployee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (!currentEmployee) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permissions = await getSessionUserPermissions(session);
    const isHrOrAdmin =
      isFullAdmin(currentEmployee.accessLevel) || permissions.canManageUsers === true;

    const data = sanitizePersonNameFields(await request.json());
    const candidateIdRaw = data.candidateId;
    const candidateId =
      candidateIdRaw === undefined || candidateIdRaw === null || candidateIdRaw === ""
        ? null
        : parseInt(String(candidateIdRaw), 10);

    if (candidateId != null && !Number.isFinite(candidateId)) {
      return NextResponse.json({ error: "Invalid candidateId" }, { status: 400 });
    }

    let hiredCandidate: {
      id: number;
      stage: string;
      employeeId: number | null;
    } | null = null;

    if (candidateId != null) {
      const access = await hiringAccessForCandidate(session.user.email, candidateId);
      if (access.notFound) {
        return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
      }
      if (
        !canOpenEmployeeCreate({
          isHrOrAdmin,
          fromHiredCandidate: true,
          hiringAllowed: access.allowed,
        })
      ) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
      }
      const [candidate] = await db
        .select({
          id: candidates.id,
          stage: candidates.stage,
          employeeId: candidates.employeeId,
        })
        .from(candidates)
        .where(eq(candidates.id, candidateId))
        .limit(1);
      if (!candidate) {
        return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
      }
      if (candidate.stage !== "hired") {
        return NextResponse.json(
          { error: "Employee can only be created from a hired candidate" },
          { status: 400 }
        );
      }
      if (candidate.employeeId) {
        return NextResponse.json(
          { error: "Candidate is already linked to an employee" },
          { status: 409 }
        );
      }
      hiredCandidate = candidate;
    } else if (
      !canOpenEmployeeCreate({
        isHrOrAdmin,
        fromHiredCandidate: false,
        hiringAllowed: false,
      })
    ) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const lastEmployee = await db
      .select({ employeeNumber: employees.employeeNumber })
      .from(employees)
      .orderBy(sql`${employees.employeeNumber} DESC NULLS LAST`)
      .limit(1);

    let nextNumber = "E001";
    if (lastEmployee.length > 0 && lastEmployee[0].employeeNumber) {
      const lastNumber = parseInt(lastEmployee[0].employeeNumber.replace("E", ""), 10);
      nextNumber = `E${String(lastNumber + 1).padStart(3, "0")}`;
    }

    const managerIdRaw =
      data.managerId === undefined || data.managerId === null || data.managerId === ""
        ? null
        : parseInt(String(data.managerId), 10);
    if (managerIdRaw != null && !Number.isFinite(managerIdRaw)) {
      return NextResponse.json({ error: "Invalid managerId" }, { status: 400 });
    }

    const allowed = await scopedEmployeeIds({
      employeeId: currentEmployee.id,
      accessLevel: currentEmployee.accessLevel,
      canManageUsers: permissions.canManageUsers,
    });
    if (managerIdRaw != null && !employeeInScope(managerIdRaw, allowed)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const accessLevel = resolveCreatedAccessLevel({
      requested: data.accessLevel,
      isHrOrAdmin,
    });

    const created = await db.transaction(async (tx) => {
      const [newEmployee] = await tx
        .insert(employees)
        .values({
          employeeNumber: nextNumber,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          hireDate: data.hireDate,
          originalHireDate: data.hireDate,
          employmentStatus: data.employmentStatus || "full_time",
          jobTitle: data.jobTitle,
          departmentId: data.departmentId ? parseInt(data.departmentId, 10) : null,
          divisionId: data.divisionId ? parseInt(data.divisionId, 10) : null,
          locationId: data.locationId ? parseInt(data.locationId, 10) : null,
          jobFamilyId: data.jobFamilyId ? parseInt(data.jobFamilyId, 10) : null,
          jobLevelId: data.jobLevelId ? parseInt(data.jobLevelId, 10) : null,
          managerId: managerIdRaw,
          accessLevel,
          workPhone: data.workPhone || null,
          linkedInUrl: data.linkedInUrl || data.linkedinUrl || null,
        })
        .returning();

      if (hiredCandidate) {
        await tx
          .update(candidates)
          .set({ employeeId: newEmployee.id, updatedAt: new Date() })
          .where(eq(candidates.id, hiredCandidate.id));
      }

      await recordEmploymentStatusChange(
        {
          employeeId: newEmployee.id,
          status: newEmployee.employmentStatus,
          effectiveDate: newEmployee.hireDate || new Date().toISOString().split("T")[0],
          comment: hiredCandidate ? "Hire from candidate" : "Hire",
          changeType: "hire",
          recordedById: currentEmployee.id,
        },
        tx
      );

      const templates = await tx
        .select()
        .from(taskTemplates)
        .where(eq(taskTemplates.taskType, "onboarding"));

      if (templates.length > 0) {
        const hireDate = new Date(data.hireDate);
        const tasksToCreate = templates.map((template) => {
          let dueDate: Date | undefined;
          if (template.dueDaysFromStart) {
            dueDate = new Date(hireDate);
            dueDate.setDate(dueDate.getDate() + template.dueDaysFromStart);
          }

          return {
            employeeId: newEmployee.id,
            templateId: template.id,
            taskType: "onboarding" as const,
            title: template.name,
            description: template.description,
            assignedToId:
              template.assignedToRole === "manager" && newEmployee.managerId
                ? newEmployee.managerId
                : currentEmployee.id,
            dueDate: dueDate ? dueDate.toISOString().split("T")[0] : null,
            status: "pending" as const,
          };
        });

        await tx.insert(employeeTasks).values(tasksToCreate);
      }

      await tx.insert(auditLogs).values({
        employeeId: session.user.employeeId,
        action: "employee_created",
        entityType: "employee",
        entityId: String(newEmployee.id),
        changes: {
          employeeNumber: nextNumber,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          hireDate: data.hireDate,
          jobTitle: data.jobTitle,
          ...(hiredCandidate ? { candidateId: hiredCandidate.id } : {}),
        },
      });

      return newEmployee;
    });

    return NextResponse.json({
      employee: {
        id: created.id,
        employeeNumber: created.employeeNumber,
        firstName: created.firstName,
        lastName: created.lastName,
        email: created.email,
        hireDate: created.hireDate,
        employmentStatus: created.employmentStatus,
        jobTitle: created.jobTitle,
        ...(hiredCandidate ? { candidateId: hiredCandidate.id } : {}),
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === UNSAFE_PERSON_NAME_MESSAGE) {
      return NextResponse.json({ error: UNSAFE_PERSON_NAME_MESSAGE }, { status: 400 });
    }
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "An employee with this email already exists" },
        { status: 409 }
      );
    }
    console.error("Failed to create employee:", errorMessage);
    return NextResponse.json(
      { error: "Failed to create employee", message: errorMessage },
      { status: 500 }
    );
  }
}
