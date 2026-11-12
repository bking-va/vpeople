import { db } from "@/lib/db";
import { holidays } from "@/lib/db/schema";
import type { HolidayDate } from "@/lib/calendar-days";

export async function loadCompanyHolidays(
  executor: { select: typeof db.select } = db
): Promise<HolidayDate[]> {
  const rows = await executor
    .select({
      date: holidays.date,
      isRecurring: holidays.isRecurring,
    })
    .from(holidays);
  return rows.map((row) => ({
    date: String(row.date).slice(0, 10),
    isRecurring: row.isRecurring,
  }));
}
