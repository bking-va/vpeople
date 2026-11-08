import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { employees, departments } from "@/lib/db/schema";
import { getHeadcountReport, headcountToCsv } from "@/lib/reports/headcount";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema: { employees, departments } });

describe("Headcount Report Integration Tests (Real Postgres)", () => {
  let testDept: any;
  let testEmployee: any;

  beforeAll(async () => {
    const testRunId = Date.now();
    const [dept] = await db
      .insert(departments)
      .values({
        name: `Headcount Dept ${testRunId}`,
      })
      .returning();
    testDept = dept;

    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: `HC_${testRunId}`,
        firstName: "Head",
        lastName: "Count",
        email: `head.count.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        departmentId: dept.id,
      })
      .returning();
    testEmployee = employee;
  });

  afterAll(async () => {
    try {
      if (testEmployee?.id) await db.delete(employees).where(eq(employees.id, testEmployee.id));
      if (testDept?.id) await db.delete(departments).where(eq(departments.id, testDept.id));
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("includes the test employee in department headcount", async () => {
    const report = await getHeadcountReport();
    const deptRow = report.byDepartment.find((row) => row.departmentId === testDept.id);
    expect(deptRow).toBeDefined();
    expect(deptRow!.count).toBeGreaterThanOrEqual(1);
    expect(report.totalActive).toBeGreaterThanOrEqual(1);

    const csv = headcountToCsv(report);
    expect(csv).toContain(testDept.name);
  });
});
