import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  employees,
  departments,
  locations,
  divisions,
  jobHistory,
  compensationHistory,
  employmentStatusHistory,
  documents,
  holidays,
  jobOpenings,
  candidates,
  terminationReasons,
  jobTitles,
  customFields,
} from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { authenticateBambooRequest } from "@/lib/bamboo-guard";
import { filterEmployeeFields, type ApiKeyAuth } from "@/lib/api-auth";
import {
  employeeInScope,
  scopedEmployeeIds,
  type EmployeeScopeViewer,
} from "@/lib/employee-scope";
import { getWhosOut } from "@/lib/whos-out";
import { formatEmploymentStatus } from "@/lib/utils/formatters";
import { CANADIAN_ROE_CODES } from "@/lib/roe";
import { canViewTerminationDetails, redactTerminationDetails } from "@/lib/authz";

function viewerFromAuth(auth: ApiKeyAuth): EmployeeScopeViewer {
  return {
    employeeId: auth.employeeId,
    accessLevel: auth.accessLevel,
    canManageUsers: auth.permissions.canManageUsers,
    canViewCompensation: auth.permissions.canViewCompensation,
    canViewSensitivePersonalInfo: auth.permissions.canViewSensitivePersonalInfo,
  };
}

async function requireBamboo(request: NextRequest, endpoint: string) {
  const result = await authenticateBambooRequest(request, endpoint);
  if ("response" in result) return result;
  const allowed = await scopedEmployeeIds(viewerFromAuth(result.auth));
  return { auth: result.auth, allowed };
}

export async function bambooWhosOut(request: NextRequest) {
  const gate = await requireBamboo(request, "/api/bamboo/v1/time_off/whos_out");
  if ("response" in gate) return gate.response;

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start") || new Date().toISOString().slice(0, 10);
  const end = searchParams.get("end") || start;

  const timeOff = await getWhosOut(start, end);
  const holidayRows = await db
    .select()
    .from(holidays)
    .where(and(gte(holidays.date, start), lte(holidays.date, end)));

  const items: Array<Record<string, unknown>> = [];
  for (const row of timeOff) {
    if (row.employeeId == null || !employeeInScope(row.employeeId, gate.allowed)) continue;
    items.push({
      id: row.requestId,
      type: "timeOff",
      employeeId: row.employeeId,
      name: `${row.preferredName || row.firstName} ${row.lastName}`.trim(),
      start: row.startDate,
      end: row.endDate,
    });
  }
  for (const holiday of holidayRows) {
    items.push({
      id: holiday.id,
      type: "holiday",
      start: holiday.date,
      end: holiday.date,
      name: holiday.name,
    });
  }
  return NextResponse.json(items);
}

function displayName(emp: { firstName: string; lastName: string; preferredName?: string | null }) {
  return emp.preferredName ? `${emp.preferredName} ${emp.lastName}` : `${emp.firstName} ${emp.lastName}`;
}

export async function bambooJobInfoTable(request: NextRequest, employeeId?: number) {
  const gate = await requireBamboo(request, "/api/bamboo/v1/tables/jobInfo");
  if ("response" in gate) return gate.response;

  if (employeeId && !employeeInScope(employeeId, gate.allowed)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: jobHistory.id,
      employeeId: jobHistory.employeeId,
      date: jobHistory.effectiveDate,
      jobTitle: jobHistory.jobTitle,
      location: locations.name,
      division: divisions.name,
      department: departments.name,
      managerId: jobHistory.managerId,
    })
    .from(jobHistory)
    .leftJoin(locations, eq(jobHistory.locationId, locations.id))
    .leftJoin(divisions, eq(jobHistory.divisionId, divisions.id))
    .leftJoin(departments, eq(jobHistory.departmentId, departments.id))
    .orderBy(desc(jobHistory.effectiveDate), desc(jobHistory.id));

  const managerIds = [...new Set(rows.map((r) => r.managerId).filter((id): id is number => Boolean(id)))];
  const managers =
    managerIds.length > 0
      ? await db
          .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            preferredName: employees.preferredName,
          })
          .from(employees)
          .where(inArray(employees.id, managerIds))
      : [];
  const managerMap = new Map(managers.map((m) => [m.id, displayName(m)]));

  const filtered = rows.filter((row) => {
    if (employeeId && row.employeeId !== employeeId) return false;
    return employeeInScope(row.employeeId, gate.allowed);
  });

  return NextResponse.json(
    filtered.map((row) => ({
      id: String(row.id),
      employeeId: String(row.employeeId),
      date: row.date,
      location: row.location || "",
      division: row.division || "",
      department: row.department || "",
      jobTitle: row.jobTitle || "",
      reportsTo: row.managerId ? managerMap.get(row.managerId) || "" : "",
    }))
  );
}

export async function bambooCompensationTable(request: NextRequest, employeeId?: number) {
  const gate = await requireBamboo(request, "/api/bamboo/v1/tables/compensation");
  if ("response" in gate) return gate.response;

  if (employeeId && !employeeInScope(employeeId, gate.allowed)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!gate.auth.permissions.canViewCompensation) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(compensationHistory)
    .orderBy(desc(compensationHistory.effectiveDate), desc(compensationHistory.id));

  const filtered = rows.filter((row) => {
    if (employeeId && row.employeeId !== employeeId) return false;
    return employeeInScope(row.employeeId, gate.allowed);
  });

  return NextResponse.json(
    filtered.map((row) => ({
      id: String(row.id),
      employeeId: String(row.employeeId),
      startDate: row.effectiveDate,
      rate: row.payRate,
      type: row.payType || "Salary",
      paidPer: row.paySchedule || "Year",
      paySchedule: row.paySchedule || "",
      reason: row.changeReason || "",
      comment: row.comment || "",
      currency: row.currency || "CAD",
    }))
  );
}

export async function bambooEmploymentStatusTable(request: NextRequest, employeeId?: number) {
  const gate = await requireBamboo(request, "/api/bamboo/v1/tables/employmentStatus");
  if ("response" in gate) return gate.response;

  if (employeeId && !employeeInScope(employeeId, gate.allowed)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: employmentStatusHistory.id,
      employeeId: employmentStatusHistory.employeeId,
      date: employmentStatusHistory.effectiveDate,
      employmentStatus: employmentStatusHistory.status,
      comment: employmentStatusHistory.comment,
      changeType: employmentStatusHistory.changeType,
      terminationReasonId: employmentStatusHistory.terminationReasonId,
    })
    .from(employmentStatusHistory)
    .orderBy(desc(employmentStatusHistory.effectiveDate), desc(employmentStatusHistory.id));

  const filtered = rows.filter((row) => {
    if (employeeId && row.employeeId !== employeeId) return false;
    return employeeInScope(row.employeeId, gate.allowed);
  });

  return NextResponse.json(
    filtered.map((row) => {
      const allowed = canViewTerminationDetails({
        isViewingSelf: row.employeeId === gate.auth.employeeId,
        canViewSensitivePersonalInfo: gate.auth.permissions.canViewSensitivePersonalInfo,
      });
      const safe = redactTerminationDetails(
        {
          comment: row.comment || "",
          changeType: row.changeType,
          terminationReasonId: row.terminationReasonId ? String(row.terminationReasonId) : null,
          terminationTypeId: row.changeType === "terminate" ? "termination" : null,
        },
        allowed
      );
      return {
        id: String(row.id),
        employeeId: String(row.employeeId),
        date: row.date,
        employmentStatus: formatEmploymentStatus(row.employmentStatus),
        comment: safe.comment || "",
        terminationReasonId: safe.terminationReasonId,
        terminationTypeId: safe.terminationTypeId,
        terminationRehireId: row.changeType === "rehire" ? "eligible" : null,
        terminationRegrettableId: null,
      };
    })
  );
}

export async function bambooFiles(request: NextRequest) {
  const gate = await requireBamboo(request, "/api/bamboo/v1/files");
  if ("response" in gate) return gate.response;

  const rows = await db.select().from(documents);
  const visible = rows.filter(
    (doc) =>
      employeeInScope(doc.employeeId, gate.allowed) &&
      (doc.employeeId === gate.auth.employeeId ||
        gate.auth.permissions.canManageUsers ||
        gate.auth.accessLevel === "full_admin")
  );

  const byCategory = new Map<string, typeof visible>();
  for (const doc of visible) {
    const list = byCategory.get(doc.category) || [];
    list.push(doc);
    byCategory.set(doc.category, list);
  }

  const categories = Array.from(byCategory.entries()).map(([name, files], index) => ({
    id: index + 1,
    name,
    files: files.map((file) => ({
      id: file.id,
      name: file.title,
      originalFileName: file.title,
      size: 0,
      dateCreated: file.createdAt.toISOString(),
      createdBy: String(file.uploadedBy),
      shareWithEmployees: file.status === "signed" ? "yes" : "no",
    })),
  }));

  return NextResponse.json({ categories });
}

export async function bambooMetaFields(request: NextRequest) {
  const gate = await requireBamboo(request, "/api/bamboo/v1/meta/fields");
  if ("response" in gate) return gate.response;

  const fields = [
    { id: 1, name: "First Name", type: "text", alias: "firstName" },
    { id: 2, name: "Last Name", type: "text", alias: "lastName" },
    { id: 3, name: "Display Name", type: "text", alias: "displayName" },
    { id: 4, name: "Work Email", type: "email", alias: "workEmail" },
    { id: 5, name: "Job Title", type: "list", alias: "jobTitle" },
    { id: 6, name: "Department", type: "list", alias: "department" },
    { id: 7, name: "Division", type: "list", alias: "division" },
    { id: 8, name: "Location", type: "list", alias: "location" },
    { id: 9, name: "Hire Date", type: "date", alias: "hireDate" },
    { id: 10, name: "Original Hire Date", type: "date", alias: "originalHireDate" },
    { id: 11, name: "Employment Status", type: "list", alias: "employmentStatus" },
    { id: 12, name: "Termination Date", type: "date", alias: "terminationDate" },
    { id: 13, name: "Employee Number", type: "text", alias: "employeeNumber" },
    { id: 14, name: "Work Phone", type: "text", alias: "workPhone" },
    { id: 15, name: "Mobile Phone", type: "text", alias: "mobilePhone" },
  ];

  if (gate.auth.permissions.canViewCompensation) {
    fields.push(
      { id: 16, name: "Pay Rate", type: "currency", alias: "payRate" },
      { id: 17, name: "Pay Type", type: "list", alias: "payType" }
    );
  }

  const custom = await db.select().from(customFields);
  for (const field of custom) {
    fields.push({
      id: 1000 + field.id,
      name: field.name,
      type: field.fieldType,
      alias: `custom_${field.id}`,
    });
  }

  return NextResponse.json(fields);
}

export async function bambooMetaLists(request: NextRequest) {
  const gate = await requireBamboo(request, "/api/bamboo/v1/meta/lists");
  if ("response" in gate) return gate.response;

  const [deptRows, locRows, titleRows, reasonRows] = await Promise.all([
    db.select().from(departments),
    db.select().from(locations),
    db.select().from(jobTitles),
    db.select().from(terminationReasons),
  ]);

  const list = (
    fieldId: number,
    alias: string,
    name: string,
    options: { id: number; name: string; createdAt?: Date }[]
  ) => ({
    fieldId,
    alias,
    manageable: "yes",
    multiple: "no",
    name,
    options: options.map((opt) => ({
      id: opt.id,
      archived: "no",
      createdDate: (opt.createdAt || new Date()).toISOString(),
      archivedDate: null,
      name: opt.name,
    })),
  });

  const lists = [
    list(6, "department", "Department", deptRows),
    list(8, "location", "Location", locRows),
    list(
      5,
      "jobTitle",
      "Job Title",
      titleRows.map((t) => ({ id: t.id, name: t.title, createdAt: t.createdAt }))
    ),
    list(11, "employmentStatus", "Employment Status", [
      { id: 1, name: "Full-Time" },
      { id: 2, name: "Part-Time" },
      { id: 3, name: "Contractor" },
      { id: 4, name: "On Leave" },
      { id: 5, name: "Terminated" },
    ]),
  ];

  if (gate.auth.permissions.canViewSensitivePersonalInfo) {
    lists.push(
      list(
        20,
        "terminationReason",
        "Termination Reason",
        reasonRows.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt }))
      ),
      list(
        21,
        "roeCode",
        "Canadian ROE Code",
        CANADIAN_ROE_CODES.map((row, index) => ({
          id: index + 1,
          name: `${row.code} — ${row.label}`,
        }))
      )
    );
  }

  return NextResponse.json(lists);
}

export async function bambooEmployeesChanged(request: NextRequest) {
  const gate = await requireBamboo(request, "/api/bamboo/v1/employees/changed");
  if ("response" in gate) return gate.response;

  const since = new URL(request.url).searchParams.get("since");
  const sinceDate = since ? new Date(since) : new Date(0);
  if (Number.isNaN(sinceDate.getTime())) {
    return NextResponse.json({ error: "Invalid since timestamp" }, { status: 400 });
  }

  const rows = await db.select().from(employees);
  const employeesChanged: Record<string, "Inserted" | "Updated"> = {};
  for (const emp of rows) {
    if (!employeeInScope(emp.id, gate.allowed)) continue;
    const lastChanged = emp.updatedAt || emp.createdAt;
    if (lastChanged < sinceDate) continue;
    employeesChanged[String(emp.id)] = emp.createdAt >= sinceDate ? "Inserted" : "Updated";
  }

  return NextResponse.json({ employees: employeesChanged });
}

export async function bambooApplicantJobs(request: NextRequest) {
  const gate = await requireBamboo(request, "/api/bamboo/v1/applicant_tracking/jobs");
  if ("response" in gate) return gate.response;
  if (!gate.auth.permissions.canManageUsers && gate.auth.accessLevel !== "full_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const openings = await db
    .select({
      id: jobOpenings.id,
      title: jobOpenings.title,
      status: jobOpenings.status,
      department: departments.name,
      location: locations.name,
      postedDate: jobOpenings.openDate,
    })
    .from(jobOpenings)
    .leftJoin(departments, eq(jobOpenings.departmentId, departments.id))
    .leftJoin(locations, eq(jobOpenings.locationId, locations.id));

  return NextResponse.json({
    jobs: openings.map((job) => ({
      id: String(job.id),
      title: job.title,
      status: job.status,
      department: job.department || "",
      location: job.location || "",
      postedDate: job.postedDate,
    })),
  });
}

export async function bambooApplicantApplications(request: NextRequest) {
  const gate = await requireBamboo(request, "/api/bamboo/v1/applicant_tracking/applications");
  if ("response" in gate) return gate.response;
  if (!gate.auth.permissions.canManageUsers && gate.auth.accessLevel !== "full_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobId = new URL(request.url).searchParams.get("jobId");
  const rows = await db.select().from(candidates);
  const filtered = jobId ? rows.filter((row) => row.jobOpeningId === Number(jobId)) : rows;

  return NextResponse.json({
    applications: filtered.map((row) => ({
      id: String(row.id),
      jobId: String(row.jobOpeningId),
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      status: row.stage,
      appliedDate: row.appliedAt.toISOString(),
      source: row.source,
      rating: row.rating,
    })),
  });
}

export async function bambooEmployeeTable(
  request: NextRequest,
  employeeId: number,
  table: string
) {
  if (table === "jobInfo") return bambooJobInfoTable(request, employeeId);
  if (table === "compensation") return bambooCompensationTable(request, employeeId);
  if (table === "employmentStatus") return bambooEmploymentStatusTable(request, employeeId);
  return NextResponse.json({ error: "Unknown table" }, { status: 404 });
}

export { filterEmployeeFields };
