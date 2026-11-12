import { db } from "@/lib/db";
import {
  employees,
  departments,
  locations,
  timeOffBalances,
  timeOffPolicies,
  timeOffRequests,
  compensationHistory,
  jobHistory,
  employmentStatusHistory,
} from "@/lib/db/schema";
import { desc, eq, sql, and, gte, lte, or } from "drizzle-orm";
import { raiseCutoffDate, isRaiseOverdue } from "./raise-overdue";
import { takenDaysInYear } from "@/lib/calendar-days";
import { loadCompanyHolidays } from "@/lib/holidays";
import { formatGender } from "@/lib/utils/formatters";
import { auth } from "@/lib/auth";
import { getSessionUserPermissions } from "@/lib/permissions";
import { canViewTerminationDetails, redactTerminationDetails } from "@/lib/authz";

export { raiseCutoffDate, isRaiseOverdue } from "./raise-overdue";

export async function getAdditionsTerminations(year: number) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const additions = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      hireDate: employees.hireDate,
      jobTitle: employees.jobTitle,
      department: departments.name,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(and(gte(employees.hireDate, start), sql`${employees.hireDate} <= ${end}`));

  const terminations = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      terminationDate: employees.terminationDate,
      jobTitle: employees.jobTitle,
      department: departments.name,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(and(gte(employees.terminationDate, start), sql`${employees.terminationDate} <= ${end}`));

  return { year, additions, terminations };
}

export async function getYearsOfService(asOf: Date = new Date()) {
  const asOfKey = asOf.toISOString().slice(0, 10);
  const rows = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      hireDate: employees.hireDate,
      jobTitle: employees.jobTitle,
      employmentStatus: employees.employmentStatus,
    })
    .from(employees)
    .where(sql`${employees.employmentStatus} <> 'terminated'`);

  return rows
    .filter((row) => row.hireDate)
    .map((row) => {
      const start = new Date(row.hireDate!);
      const end = new Date(asOfKey);
      const years = (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return { ...row, yearsOfService: Number(years.toFixed(1)) };
    })
    .sort((a, b) => b.yearsOfService - a.yearsOfService);
}

export async function getTimeOffBalanceReport() {
  return db
    .select({
      employeeId: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      policy: timeOffPolicies.name,
      balance: timeOffBalances.balance,
    })
    .from(timeOffBalances)
    .innerJoin(employees, eq(timeOffBalances.employeeId, employees.id))
    .innerJoin(timeOffPolicies, eq(timeOffBalances.policyId, timeOffPolicies.id))
    .where(sql`${employees.employmentStatus} <> 'terminated'`);
}

export async function getTimeOffUsedReport(year: number, asOf: Date = new Date()) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const companyHolidays = await loadCompanyHolidays();
  const rows = await db
    .select({
      employeeId: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      policy: timeOffPolicies.name,
      startDate: timeOffRequests.startDate,
      endDate: timeOffRequests.endDate,
      daysRequested: timeOffRequests.daysRequested,
      status: timeOffRequests.status,
    })
    .from(timeOffRequests)
    .innerJoin(employees, eq(timeOffRequests.employeeId, employees.id))
    .leftJoin(timeOffPolicies, eq(timeOffRequests.policyId, timeOffPolicies.id))
    .where(
      and(
        eq(timeOffRequests.status, "approved"),
        gte(timeOffRequests.startDate, start),
        sql`${timeOffRequests.startDate} <= ${end}`
      )
    );

  return rows
    .map((row) => {
      const daysUsed = takenDaysInYear(
        row.startDate,
        row.endDate,
        year,
        asOf,
        companyHolidays
      );
      return { ...row, daysUsed: daysUsed.toString() };
    })
    .filter((row) => parseFloat(row.daysUsed) > 0);
}

export async function getLastPayChangeReport() {
  const rows = await db
    .select({
      employeeId: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      jobTitle: employees.jobTitle,
      payRate: compensationHistory.payRate,
      effectiveDate: compensationHistory.effectiveDate,
      changeReason: compensationHistory.changeReason,
    })
    .from(compensationHistory)
    .innerJoin(employees, eq(compensationHistory.employeeId, employees.id))
    .orderBy(desc(compensationHistory.effectiveDate));

  const latest = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.employeeId)) {
      latest.set(row.employeeId, row);
    }
  }
  return Array.from(latest.values());
}

export async function getPeopleWithoutRaise(asOf: Date = new Date(), months = 12) {
  const cutoff = raiseCutoffDate(asOf, months);
  const latest = await getLastPayChangeReport();
  const latestByEmployee = new Map(latest.map((row) => [row.employeeId, row]));

  const active = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      jobTitle: employees.jobTitle,
      hireDate: employees.hireDate,
    })
    .from(employees)
    .where(sql`${employees.employmentStatus} <> 'terminated'`);

  return active
    .map((emp) => {
      const last = latestByEmployee.get(emp.id);
      const lastRaiseDate = last?.effectiveDate ?? null;
      return {
        ...emp,
        lastRaiseDate,
        lastPayRate: last?.payRate ?? null,
        overdue: isRaiseOverdue(lastRaiseDate, cutoff),
      };
    })
    .filter((row) => row.overdue)
    .sort((a, b) => (a.lastRaiseDate || a.hireDate || "").localeCompare(b.lastRaiseDate || b.hireDate || ""));
}

export async function getBirthdaysReport() {
  return db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      birthDate: employees.birthDate,
      department: departments.name,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(sql`${employees.employmentStatus} <> 'terminated'`);
}

export async function getAgeGenderReport(asOf: Date = new Date()) {
  const rows = await db
    .select({
      id: employees.id,
      gender: employees.gender,
      birthDate: employees.birthDate,
      employmentStatus: employees.employmentStatus,
    })
    .from(employees)
    .where(sql`${employees.employmentStatus} <> 'terminated'`);

  const byGender = new Map<string, number>();
  const byAgeBand = new Map<string, number>();
  const bands = ["<25", "25-34", "35-44", "45-54", "55+", "unknown"];
  for (const band of bands) byAgeBand.set(band, 0);

  for (const row of rows) {
    const g = formatGender(row.gender);
    byGender.set(g, (byGender.get(g) || 0) + 1);
    if (!row.birthDate) {
      byAgeBand.set("unknown", (byAgeBand.get("unknown") || 0) + 1);
      continue;
    }
    const age = Math.floor(
      (asOf.getTime() - new Date(row.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );
    const band = age < 25 ? "<25" : age < 35 ? "25-34" : age < 45 ? "35-44" : age < 55 ? "45-54" : "55+";
    byAgeBand.set(band, (byAgeBand.get(band) || 0) + 1);
  }

  return {
    byGender: Array.from(byGender.entries()).map(([gender, count]) => ({ gender, count })),
    byAgeBand: Array.from(byAgeBand.entries()).map(([band, count]) => ({ band, count })),
  };
}

export async function getJobHistoryReport() {
  return db
    .select({
      employeeId: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      effectiveDate: jobHistory.effectiveDate,
      jobTitle: jobHistory.jobTitle,
      comment: jobHistory.comment,
    })
    .from(jobHistory)
    .innerJoin(employees, eq(jobHistory.employeeId, employees.id))
    .orderBy(desc(jobHistory.effectiveDate));
}

async function sessionCanViewCompensation() {
  const session = await auth();
  if (!session?.user?.employeeId) return false;
  const permissions = await getSessionUserPermissions(session);
  return permissions.canViewCompensation === true;
}

export async function getEmploymentStatusHistoryReport(opts?: {
  viewerId?: number;
  canViewSensitivePersonalInfo?: boolean;
}) {
  const rows = await db
    .select({
      id: employmentStatusHistory.id,
      employeeId: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      employmentStatus: employmentStatusHistory.status,
      effectiveDate: employmentStatusHistory.effectiveDate,
      changeType: employmentStatusHistory.changeType,
      comment: employmentStatusHistory.comment,
      department: departments.name,
      location: locations.name,
    })
    .from(employmentStatusHistory)
    .innerJoin(employees, eq(employmentStatusHistory.employeeId, employees.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(locations, eq(employees.locationId, locations.id))
    .orderBy(desc(employmentStatusHistory.effectiveDate), desc(employmentStatusHistory.id));

  if (opts?.canViewSensitivePersonalInfo) return rows;

  return rows.map((row) =>
    redactTerminationDetails(
      row,
      canViewTerminationDetails({
        isViewingSelf: opts?.viewerId != null && row.employeeId === opts.viewerId,
        canViewSensitivePersonalInfo: Boolean(opts?.canViewSensitivePersonalInfo),
      })
    )
  );
}

export async function getSalaryHistoryReport(opts?: { canViewCompensation?: boolean }) {
  if (opts?.canViewCompensation === false) return [];
  if (!(await sessionCanViewCompensation())) return [];
  return db
    .select({
      id: compensationHistory.id,
      employeeId: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      jobTitle: employees.jobTitle,
      payRate: compensationHistory.payRate,
      payType: compensationHistory.payType,
      paySchedule: compensationHistory.paySchedule,
      currency: compensationHistory.currency,
      effectiveDate: compensationHistory.effectiveDate,
      changeReason: compensationHistory.changeReason,
    })
    .from(compensationHistory)
    .innerJoin(employees, eq(compensationHistory.employeeId, employees.id))
    .orderBy(desc(compensationHistory.effectiveDate), desc(compensationHistory.id));
}

export async function getTimeOffScheduleReport(year: number) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  return db
    .select({
      id: timeOffRequests.id,
      employeeId: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      policy: timeOffPolicies.name,
      startDate: timeOffRequests.startDate,
      endDate: timeOffRequests.endDate,
      daysRequested: timeOffRequests.daysRequested,
      status: timeOffRequests.status,
    })
    .from(timeOffRequests)
    .innerJoin(employees, eq(timeOffRequests.employeeId, employees.id))
    .leftJoin(timeOffPolicies, eq(timeOffRequests.policyId, timeOffPolicies.id))
    .where(
      and(
        or(eq(timeOffRequests.status, "approved"), eq(timeOffRequests.status, "pending")),
        lte(timeOffRequests.startDate, end),
        gte(timeOffRequests.endDate, start)
      )
    )
    .orderBy(timeOffRequests.startDate, employees.lastName);
}

type PayRow = {
  employeeId: number;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  department: string | null;
  location: string | null;
  payRate: string | null;
  payType: string | null;
  currency: string | null;
};

type CompensationAccess = { canViewCompensation?: boolean; asOf?: Date };

async function getCurrentPayRows(opts: CompensationAccess = {}): Promise<PayRow[]> {
  if (opts.canViewCompensation === false) return [];
  if (!(await sessionCanViewCompensation())) return [];
  const asOfKey = (opts.asOf ?? new Date()).toISOString().slice(0, 10);

  const history = await db
    .select({
      employeeId: compensationHistory.employeeId,
      payRate: compensationHistory.payRate,
      payType: compensationHistory.payType,
      currency: compensationHistory.currency,
      effectiveDate: compensationHistory.effectiveDate,
    })
    .from(compensationHistory)
    .where(lte(compensationHistory.effectiveDate, asOfKey))
    .orderBy(desc(compensationHistory.effectiveDate), desc(compensationHistory.id));

  const latest = new Map<number, (typeof history)[number]>();
  for (const row of history) {
    if (!latest.has(row.employeeId)) latest.set(row.employeeId, row);
  }

  const active = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      jobTitle: employees.jobTitle,
      department: departments.name,
      location: locations.name,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(locations, eq(employees.locationId, locations.id))
    .where(sql`${employees.employmentStatus} <> 'terminated'`);

  return active.map((emp) => {
    const pay = latest.get(emp.id);
    return {
      employeeId: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      jobTitle: emp.jobTitle,
      department: emp.department,
      location: emp.location,
      payRate: pay?.payRate ?? null,
      payType: pay?.payType ?? "salary",
      currency: pay?.currency ?? "CAD",
    };
  });
}

export type PayGroupRow = {
  group: string;
  count: number;
  avgPay: number;
  minPay: number;
  maxPay: number;
  currency: string;
  payType: string;
};

function aggregatePay(rows: PayRow[], groupOf: (row: PayRow) => string | null | undefined): PayGroupRow[] {
  const groups = new Map<string, { rates: number[]; currency: string; payType: string; label: string }>();
  for (const row of rows) {
    const rate = row.payRate != null ? parseFloat(row.payRate) : NaN;
    if (!Number.isFinite(rate)) continue;
    const payType = (row.payType || "salary").toLowerCase();
    const currency = row.currency || "CAD";
    const base = (groupOf(row) || "Unassigned").trim() || "Unassigned";
    const key = `${base}\u0000${currency}\u0000${payType}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rates.push(rate);
    } else {
      groups.set(key, {
        rates: [rate],
        currency,
        payType,
        label: `${base} · ${currency} · ${payType}`,
      });
    }
  }

  return Array.from(groups.values())
    .map((entry) => ({
      group: entry.label,
      count: entry.rates.length,
      avgPay: Number((entry.rates.reduce((sum, n) => sum + n, 0) / entry.rates.length).toFixed(2)),
      minPay: Math.min(...entry.rates),
      maxPay: Math.max(...entry.rates),
      currency: entry.currency,
      payType: entry.payType,
    }))
    .sort((a, b) => b.avgPay - a.avgPay);
}

export async function getPayByTitleReport(opts: CompensationAccess = {}) {
  return aggregatePay(await getCurrentPayRows(opts), (row) => row.jobTitle);
}

export async function getPayByDepartmentReport(opts: CompensationAccess = {}) {
  return aggregatePay(await getCurrentPayRows(opts), (row) => row.department);
}

export async function getPayByLocationReport(opts: CompensationAccess = {}) {
  return aggregatePay(await getCurrentPayRows(opts), (row) => row.location);
}
