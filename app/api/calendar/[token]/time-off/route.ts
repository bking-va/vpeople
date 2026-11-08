import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, timeOffRequests, timeOffPolicies } from "@/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";

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

    // Fetch approved time off for all employees (60 days past, 365 days future)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 60);
    const startDateStr = startDate.toISOString().split("T")[0];

    const timeOffData = await db
      .select({
        request: timeOffRequests,
        employee: {
          firstName: employees.firstName,
          lastName: employees.lastName,
        },
        policy: {
          name: timeOffPolicies.name,
        },
      })
      .from(timeOffRequests)
      .leftJoin(employees, eq(timeOffRequests.employeeId, employees.id))
      .leftJoin(timeOffPolicies, eq(timeOffRequests.policyId, timeOffPolicies.id))
      .where(
        and(
          eq(timeOffRequests.status, "approved"),
          gte(timeOffRequests.endDate, startDateStr)
        )
      );

    // Generate iCalendar format
    const icalEvents = timeOffData.map((item) => {
      const empName = item.employee
        ? `${item.employee.firstName} ${item.employee.lastName}`
        : "Unknown";
      const policyName = item.policy?.name || "Time Off";
      
      const startDate = item.request.startDate.replace(/-/g, "");
      const endDate = item.request.endDate.replace(/-/g, "");
      
      // iCal uses the day AFTER the end date for all-day events
      const endDateNext = new Date(item.request.endDate);
      endDateNext.setDate(endDateNext.getDate() + 1);
      const endDateNextStr = endDateNext.toISOString().split("T")[0].replace(/-/g, "");

      return [
        "BEGIN:VEVENT",
        `UID:timeoff-${item.request.id}@vpeople.vendasta.com`,
        `DTSTART;VALUE=DATE:${startDate}`,
        `DTEND;VALUE=DATE:${endDateNextStr}`,
        `SUMMARY:${empName} - ${policyName}`,
        `DESCRIPTION:${item.request.daysRequested} days`,
        "STATUS:CONFIRMED",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      ].join("\r\n");
    });

    const ical = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//vPeople//Time Off Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:vPeople - Who's Out",
      "X-WR-TIMEZONE:UTC",
      ...icalEvents,
      "END:VCALENDAR",
    ].join("\r\n");

    return new NextResponse(ical, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="vpeople-time-off.ics"',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to generate calendar:", errorMessage);
    return new NextResponse("Failed to generate calendar", { status: 500 });
  }
}
