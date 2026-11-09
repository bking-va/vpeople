import { db } from "@/lib/db";
import { employees, departments, locations, divisions } from "@/lib/db/schema";
import { and, eq, gte, lte, or, inArray, ilike, type SQL } from "drizzle-orm";
import {
  filterRowsByEmployeeScope,
  redactReportEmail,
  scopedEmployeeIds,
  type EmployeeScopeViewer,
} from "@/lib/employee-scope";

export const CUSTOM_REPORT_FIELDS = [
  "employeeNumber",
  "firstName",
  "lastName",
  "email",
  "jobTitle",
  "department",
  "division",
  "location",
  "hireDate",
  "employmentStatus",
  "workPhone",
  "mobilePhone",
] as const;

export type CustomReportField = (typeof CUSTOM_REPORT_FIELDS)[number];

export type CustomReportFilters = {
  departmentId?: number | null;
  locationId?: number | null;
  employmentStatus?: string | null;
  hireDateFrom?: string | null;
  hireDateTo?: string | null;
  search?: string | null;
};

export async function runCustomEmployeeReport(opts: {
  fields: string[];
  groupBy?: string | null;
  filters?: CustomReportFilters;
  viewer: EmployeeScopeViewer;
}) {
  const allowed = await scopedEmployeeIds(opts.viewer);
  const conditions: SQL[] = [];

  if (opts.filters?.departmentId) {
    conditions.push(eq(employees.departmentId, opts.filters.departmentId));
  }
  if (opts.filters?.locationId) {
    conditions.push(eq(employees.locationId, opts.filters.locationId));
  }
  if (opts.filters?.employmentStatus && opts.filters.employmentStatus !== "all") {
    conditions.push(eq(employees.employmentStatus, opts.filters.employmentStatus as any));
  }
  if (opts.filters?.hireDateFrom) {
    conditions.push(gte(employees.hireDate, opts.filters.hireDateFrom));
  }
  if (opts.filters?.hireDateTo) {
    conditions.push(lte(employees.hireDate, opts.filters.hireDateTo));
  }
  if (opts.filters?.search) {
    const q = `%${opts.filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(employees.firstName, q),
        ilike(employees.lastName, q),
        ilike(employees.email, q),
        ilike(employees.jobTitle, q),
        ilike(employees.employeeNumber, q)
      )!
    );
  }

  if (allowed !== "all") {
    const ids = Array.from(allowed);
    if (ids.length === 0) {
      return { rows: [], count: 0 };
    }
    conditions.push(inArray(employees.id, ids));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const allEmployees = await db
    .select()
    .from(employees)
    .where(whereClause);

  const scoped = filterRowsByEmployeeScope(allEmployees, allowed);

  const depts = await db.select().from(departments);
  const locs = await db.select().from(locations);
  const divs = await db.select().from(divisions);
  const deptMap = new Map(depts.map((d) => [d.id, d.name]));
  const locMap = new Map(locs.map((l) => [l.id, l.name]));
  const divMap = new Map(divs.map((d) => [d.id, d.name]));

  const requested = opts.fields.filter((f) =>
    CUSTOM_REPORT_FIELDS.includes(f as CustomReportField)
  );
  const fields = requested.length > 0 ? requested : [...CUSTOM_REPORT_FIELDS];

  const enriched = scoped.map((emp) => {
    const row: Record<string, unknown> = {
      id: emp.id,
      employeeNumber: emp.employeeNumber,
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: redactReportEmail(emp.email, {
        employeeId: emp.id,
        viewerId: opts.viewer.employeeId,
        canViewSensitivePersonalInfo: Boolean(opts.viewer.canViewSensitivePersonalInfo),
      }),
      jobTitle: emp.jobTitle,
      department: emp.departmentId ? deptMap.get(emp.departmentId) : null,
      division: emp.divisionId ? divMap.get(emp.divisionId) : null,
      location: emp.locationId ? locMap.get(emp.locationId) : null,
      hireDate: emp.hireDate,
      employmentStatus: emp.employmentStatus,
      workPhone: emp.workPhone,
      mobilePhone: emp.mobilePhone,
    };
    const filtered: Record<string, unknown> = {};
    for (const field of fields) {
      filtered[field] = row[field] ?? null;
    }
    return filtered;
  });

  const groupBy = opts.groupBy && opts.groupBy !== "none" ? opts.groupBy : null;
  if (!groupBy) {
    return { rows: enriched, count: enriched.length };
  }

  const grouped: Record<string, Record<string, unknown>[]> = {};
  for (const row of enriched) {
    const key = String(row[groupBy] || "Unassigned");
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  }

  const result = Object.entries(grouped).flatMap(([group, items]) => [
    { _group: group, _groupCount: items.length },
    ...items,
  ]);

  return { rows: result, count: enriched.length };
}

export function parseReportFilters(searchParams: URLSearchParams): CustomReportFilters {
  const departmentId = searchParams.get("departmentId");
  const locationId = searchParams.get("locationId");
  return {
    departmentId: departmentId ? Number(departmentId) : null,
    locationId: locationId ? Number(locationId) : null,
    employmentStatus: searchParams.get("employmentStatus"),
    hireDateFrom: searchParams.get("hireDateFrom"),
    hireDateTo: searchParams.get("hireDateTo"),
    search: searchParams.get("search"),
  };
}
