import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { escapeIcalText } from "@/lib/ical";

function icalDate(month: number, day: number, year: number) {
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

function nextOccurrence(month: number, day: number, from: Date) {
  const thisYear = new Date(from.getFullYear(), month - 1, day);
  if (thisYear >= new Date(from.getFullYear(), from.getMonth(), from.getDate())) {
    return thisYear;
  }
  return new Date(from.getFullYear() + 1, month - 1, day);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.calendarToken, token))
      .limit(1);

    if (!employee) {
      return new NextResponse("Invalid calendar token", { status: 404 });
    }

    const people = await db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        preferredName: employees.preferredName,
        birthDate: employees.birthDate,
        hireDate: employees.hireDate,
      })
      .from(employees)
      .where(sql`${employees.employmentStatus} <> 'terminated'`);

    const today = new Date();
    const events: string[] = [];

    for (const person of people) {
      const name = person.preferredName
        ? `${person.preferredName} ${person.lastName}`
        : `${person.firstName} ${person.lastName}`;
      if (person.birthDate) {
        const [, month, day] = person.birthDate.split("-").map(Number);
        const next = nextOccurrence(month, day, today);
        const start = icalDate(month, day, next.getFullYear());
        const endDate = new Date(next);
        endDate.setDate(endDate.getDate() + 1);
        const end = icalDate(endDate.getMonth() + 1, endDate.getDate(), endDate.getFullYear());
        events.push(
          [
            "BEGIN:VEVENT",
            `UID:birthday-${person.id}-${next.getFullYear()}@vpeople.vendasta.com`,
            `DTSTART;VALUE=DATE:${start}`,
            `DTEND;VALUE=DATE:${end}`,
            `SUMMARY:${escapeIcalText(`${name} — Birthday`)}`,
            "TRANSP:TRANSPARENT",
            "END:VEVENT",
          ].join("\r\n")
        );
      }
      if (person.hireDate) {
        const [, month, day] = person.hireDate.split("-").map(Number);
        const next = nextOccurrence(month, day, today);
        const start = icalDate(month, day, next.getFullYear());
        const endDate = new Date(next);
        endDate.setDate(endDate.getDate() + 1);
        const end = icalDate(endDate.getMonth() + 1, endDate.getDate(), endDate.getFullYear());
        const years = next.getFullYear() - Number(person.hireDate.slice(0, 4));
        events.push(
          [
            "BEGIN:VEVENT",
            `UID:anniversary-${person.id}-${next.getFullYear()}@vpeople.vendasta.com`,
            `DTSTART;VALUE=DATE:${start}`,
            `DTEND;VALUE=DATE:${end}`,
            `SUMMARY:${escapeIcalText(`${name} — ${years} year anniversary`)}`,
            "TRANSP:TRANSPARENT",
            "END:VEVENT",
          ].join("\r\n")
        );
      }
    }

    const ical = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//vPeople//Celebrations Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeIcalText("vPeople - Birthdays and Anniversaries")}`,
      "X-WR-TIMEZONE:UTC",
      ...events,
      "END:VCALENDAR",
    ].join("\r\n");

    return new NextResponse(ical, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="vpeople-celebrations.ics"',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to generate celebrations calendar:", errorMessage);
    return new NextResponse("Failed to generate calendar", { status: 500 });
  }
}
