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
} from "@/lib/db/schema";
import { desc, eq, sql, and, gte } from "drizzle-orm";

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

export async function getTimeOffUsedReport(year: number) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  return db
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
    const g = row.gender || "unspecified";
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

export async function getEmploymentStatusHistoryReport() {
  return db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      employmentStatus: employees.employmentStatus,
      hireDate: employees.hireDate,
      terminationDate: employees.terminationDate,
      department: departments.name,
      location: locations.name,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(locations, eq(employees.locationId, locations.id));
}
