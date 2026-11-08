import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

describe("Calendar Tokens", () => {
  let testEmployeeId: number;

  beforeAll(async () => {
    // Create test employee
    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: "CAL_TEST_EMP",
        firstName: "Calendar",
        lastName: "Test",
        email: "calendar.test@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();

    testEmployeeId = employee.id;
  });

  afterAll(async () => {
    // Clean up
    await db.delete(employees).where(eq(employees.id, testEmployeeId));
  });

  test("generates secure calendar token", () => {
    const token = randomBytes(32).toString("hex");
    expect(token).toBeDefined();
    expect(token.length).toBe(64); // 32 bytes = 64 hex characters
    expect(/^[a-f0-9]{64}$/.test(token)).toBe(true);
  });

  test("stores calendar token in employee record", async () => {
    const token = randomBytes(32).toString("hex");

    const [updated] = await db
      .update(employees)
      .set({ calendarToken: token })
      .where(eq(employees.id, testEmployeeId))
      .returning();

    expect(updated.calendarToken).toBe(token);
  });

  test("retrieves calendar token for employee", async () => {
    const [employee] = await db
      .select({ calendarToken: employees.calendarToken })
      .from(employees)
      .where(eq(employees.id, testEmployeeId))
      .limit(1);

    expect(employee.calendarToken).toBeDefined();
    expect(employee.calendarToken?.length).toBe(64);
  });

  test("regenerates calendar token", async () => {
    // Get current token
    const [employee] = await db
      .select({ calendarToken: employees.calendarToken })
      .from(employees)
      .where(eq(employees.id, testEmployeeId))
      .limit(1);

    const oldToken = employee.calendarToken;

    // Generate new token
    const newToken = randomBytes(32).toString("hex");

    const [updated] = await db
      .update(employees)
      .set({ calendarToken: newToken })
      .where(eq(employees.id, testEmployeeId))
      .returning();

    expect(updated.calendarToken).toBe(newToken);
    expect(updated.calendarToken).not.toBe(oldToken);
  });

  test("calendar token is unique per employee", async () => {
    // Create second employee
    const [employee2] = await db
      .insert(employees)
      .values({
        employeeNumber: "CAL_TEST_EMP2",
        firstName: "Calendar2",
        lastName: "Test2",
        email: "calendar.test2@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        calendarToken: randomBytes(32).toString("hex"),
      })
      .returning();

    const [employee1] = await db
      .select({ calendarToken: employees.calendarToken })
      .from(employees)
      .where(eq(employees.id, testEmployeeId))
      .limit(1);

    expect(employee1.calendarToken).not.toBe(employee2.calendarToken);

    // Clean up
    await db.delete(employees).where(eq(employees.id, employee2.id));
  });

  test("constructs valid iCalendar URLs", () => {
    const token = "abc123def456";
    const baseUrl = "https://vpeople.test";
    
    const timeOffUrl = `${baseUrl}/api/calendar/${token}/time-off`;
    const holidaysUrl = `${baseUrl}/api/calendar/${token}/holidays`;

    expect(timeOffUrl).toBe("https://vpeople.test/api/calendar/abc123def456/time-off");
    expect(holidaysUrl).toBe("https://vpeople.test/api/calendar/abc123def456/holidays");
  });
});
