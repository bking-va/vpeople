import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { employees } from "@/lib/db/schema";
import { getTurnoverReport, turnoverToCsv } from "@/lib/reports/turnover";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: { employees } });

describe("Turnover report (Real Postgres)", () => {
  let hired: { id: number };
  let termed: { id: number };

  beforeAll(async () => {
    const testRunId = Date.now();
    const [h] = await db
      .insert(employees)
      .values({
        employeeNumber: `TOH_${testRunId}`,
        firstName: "Hired",
        lastName: "ThisYear",
        email: `hired.${testRunId}@test.com`,
        hireDate: "2026-06-01",
        employmentStatus: "full_time",
      })
      .returning();
    hired = h;

    const [t] = await db
      .insert(employees)
      .values({
        employeeNumber: `TOT_${testRunId}`,
        firstName: "Left",
        lastName: "Company",
        email: `left.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        terminationDate: "2026-09-15",
        employmentStatus: "terminated",
      })
      .returning();
    termed = t;
  });

  afterAll(async () => {
    try {
      if (hired?.id) await db.delete(employees).where(eq(employees.id, hired.id));
      if (termed?.id) await db.delete(employees).where(eq(employees.id, termed.id));
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("counts the fixture hire and termination in the 12-month window", async () => {
    const asOf = new Date("2026-11-08T12:00:00Z");
    const report = await getTurnoverReport(asOf);

    expect(report.hires).toBeGreaterThanOrEqual(1);
    expect(report.terminations).toBeGreaterThanOrEqual(1);
    expect(report.terminationsDetail.some((row) => row.id === termed.id)).toBe(true);

    const june = report.byMonth.find((row) => row.month === "2026-06");
    const sept = report.byMonth.find((row) => row.month === "2026-09");
    expect(june?.hires).toBeGreaterThanOrEqual(1);
    expect(sept?.terms).toBeGreaterThanOrEqual(1);

    const csv = turnoverToCsv(report);
    expect(csv).toContain("Turnover Rate %");
  });
});
