import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { and, gte, lte, sql, isNotNull } from "drizzle-orm";

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getTurnoverReport(asOf: Date = new Date()) {
  const start = new Date(Date.UTC(asOf.getUTCFullYear() - 1, asOf.getUTCMonth(), 1));
  const startKey = start.toISOString().slice(0, 10);
  const endKey = asOf.toISOString().slice(0, 10);

  const [active] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(sql`${employees.employmentStatus} <> 'terminated'`);

  const [terminated] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(
      and(
        isNotNull(employees.terminationDate),
        gte(employees.terminationDate, startKey),
        lte(employees.terminationDate, endKey)
      )
    );

  const [hired] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(isNotNull(employees.hireDate), gte(employees.hireDate, startKey), lte(employees.hireDate, endKey)));

  const headcount = active?.count ?? 0;
  const terms = terminated?.count ?? 0;
  const hires = hired?.count ?? 0;
  const turnoverRate = headcount > 0 ? Number(((terms / headcount) * 100).toFixed(1)) : 0;

  const termRows = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      hireDate: employees.hireDate,
      terminationDate: employees.terminationDate,
      jobTitle: employees.jobTitle,
    })
    .from(employees)
    .where(
      and(
        isNotNull(employees.terminationDate),
        gte(employees.terminationDate, startKey),
        lte(employees.terminationDate, endKey)
      )
    );

  const byMonth = new Map<string, { hires: number; terms: number }>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 11 + i, 1));
    byMonth.set(monthKey(d), { hires: 0, terms: 0 });
  }

  const hireDates = await db
    .select({ hireDate: employees.hireDate, terminationDate: employees.terminationDate })
    .from(employees);

  for (const row of hireDates) {
    if (row.hireDate && row.hireDate >= startKey && row.hireDate <= endKey) {
      const key = row.hireDate.slice(0, 7);
      const bucket = byMonth.get(key);
      if (bucket) bucket.hires += 1;
    }
    if (row.terminationDate && row.terminationDate >= startKey && row.terminationDate <= endKey) {
      const key = row.terminationDate.slice(0, 7);
      const bucket = byMonth.get(key);
      if (bucket) bucket.terms += 1;
    }
  }

  return {
    windowStart: startKey,
    windowEnd: endKey,
    activeHeadcount: headcount,
    hires,
    terminations: terms,
    turnoverRate,
    byMonth: Array.from(byMonth.entries()).map(([month, counts]) => ({ month, ...counts })),
    terminationsDetail: termRows,
  };
}

export { turnoverToCsv } from "./turnover-format";
