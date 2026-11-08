import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, holidays } from "@/lib/db/schema";
import { eq, gte } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const resolvedParams = await params;
    const token = resolvedParams.token;

    // Find employee by calendar token
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.calendarToken, token))
      .limit(1);

    if (!employee) {
      return new NextResponse("Invalid calendar token", { status: 404 });
    }

    // Fetch holidays (60 days past, 365 days future)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 60);
    const startDateStr = startDate.toISOString().split("T")[0];

    const holidayData = await db
      .select()
      .from(holidays)
      .where(gte(holidays.date, startDateStr));

    // Generate iCalendar format
    const icalEvents = holidayData.map((holiday) => {
      const dateStr = holiday.date.replace(/-/g, "");
      
      // iCal uses the day AFTER the end date for all-day events
      const endDate = new Date(holiday.date);
      endDate.setDate(endDate.getDate() + 1);
      const endDateStr = endDate.toISOString().split("T")[0].replace(/-/g, "");

      return [
        "BEGIN:VEVENT",
        `UID:holiday-${holiday.id}@vpeople.vendasta.com`,
        `DTSTART;VALUE=DATE:${dateStr}`,
        `DTEND;VALUE=DATE:${endDateStr}`,
        `SUMMARY:${holiday.name} (${holiday.country})`,
        "STATUS:CONFIRMED",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      ].join("\r\n");
    });

    const ical = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//vPeople//Holidays Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:vPeople - Holidays",
      "X-WR-TIMEZONE:UTC",
      ...icalEvents,
      "END:VCALENDAR",
    ].join("\r\n");

    return new NextResponse(ical, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="vpeople-holidays.ics"',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to generate calendar:", errorMessage);
    return new NextResponse("Failed to generate calendar", { status: 500 });
  }
}
