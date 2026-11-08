import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import {
  employees,
  timeOffPolicies,
  timeOffRequests,
} from "@/lib/db/schema";
import { getWhosOut, isOutOnDate } from "@/lib/whos-out";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, {
  schema: { employees, timeOffPolicies, timeOffRequests },
});

describe("Who's Out Integration Tests (Real Postgres)", () => {
  let testEmployee: any;
  let testPolicy: any;
  let testRequest: any;

  beforeAll(async () => {
    const testRunId = Date.now();
    const [policy] = await db
      .insert(timeOffPolicies)
      .values({
        name: `Whos Out Policy ${testRunId}`,
        policyType: "vacation",
      })
      .returning();
    testPolicy = policy;

    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: `WHOS_OUT_${testRunId}`,
        firstName: "Out",
        lastName: "Today",
        email: `out.today.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    testEmployee = employee;

    const [request] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: employee.id,
        policyId: policy.id,
        startDate: "2027-08-10",
        endDate: "2027-08-12",
        daysRequested: "3",
        status: "approved",
      })
      .returning();
    testRequest = request;
  });

  afterAll(async () => {
    try {
      if (testRequest?.id) await db.delete(timeOffRequests).where(eq(timeOffRequests.id, testRequest.id));
      if (testEmployee?.id) await db.delete(employees).where(eq(employees.id, testEmployee.id));
      if (testPolicy?.id) await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, testPolicy.id));
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("returns approved time off overlapping the requested window", async () => {
    const results = await getWhosOut("2027-08-10", "2027-08-10");
    expect(results.some((row) => row.requestId === testRequest.id)).toBe(true);
    expect(isOutOnDate("2027-08-10", "2027-08-12", "2027-08-10")).toBe(true);
  });

  test("excludes pending requests", async () => {
    const [pending] = await db
      .insert(timeOffRequests)
      .values({
        employeeId: testEmployee.id,
        policyId: testPolicy.id,
        startDate: "2027-08-10",
        endDate: "2027-08-10",
        daysRequested: "1",
        status: "pending",
      })
      .returning();

    const results = await getWhosOut("2027-08-10", "2027-08-10");
    expect(results.some((row) => row.requestId === pending.id)).toBe(false);

    await db.delete(timeOffRequests).where(eq(timeOffRequests.id, pending.id));
  });
});
