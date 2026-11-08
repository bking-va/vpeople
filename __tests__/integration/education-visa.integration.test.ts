import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { employees, employeeEducation, employeeVisas } from "@/lib/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, {
  schema: { employees, employeeEducation, employeeVisas },
});

describe("Education and visa tables (Real Postgres)", () => {
  let employee: { id: number };

  beforeAll(async () => {
    const testRunId = Date.now();
    const [e] = await db
      .insert(employees)
      .values({
        employeeNumber: `EDU_${testRunId}`,
        firstName: "Edu",
        lastName: "Visa",
        email: `edu.visa.${testRunId}@test.com`,
        hireDate: "2021-03-01",
        employmentStatus: "full_time",
      })
      .returning();
    employee = e;

    await db.insert(employeeEducation).values({
      employeeId: e.id,
      institution: "Test University",
      degree: "BSc",
      fieldOfStudy: "Computer Science",
      startDate: "2014-09-01",
      endDate: "2018-05-01",
    });

    await db.insert(employeeVisas).values({
      employeeId: e.id,
      visaType: "H-1B",
      country: "US",
      documentNumber: "H1B-TEST",
      issuedDate: "2024-01-01",
      expiryDate: "2027-01-01",
      status: "active",
    });
  });

  afterAll(async () => {
    try {
      if (employee?.id) {
        await db.delete(employeeEducation).where(eq(employeeEducation.employeeId, employee.id));
        await db.delete(employeeVisas).where(eq(employeeVisas.employeeId, employee.id));
        await db.delete(employees).where(eq(employees.id, employee.id));
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("stores education and visa rows for an employee", async () => {
    const edu = await db
      .select()
      .from(employeeEducation)
      .where(eq(employeeEducation.employeeId, employee.id));
    expect(edu).toHaveLength(1);
    expect(edu[0].institution).toBe("Test University");
    expect(edu[0].degree).toBe("BSc");

    const visas = await db
      .select()
      .from(employeeVisas)
      .where(eq(employeeVisas.employeeId, employee.id));
    expect(visas).toHaveLength(1);
    expect(visas[0].visaType).toBe("H-1B");
    expect(visas[0].status).toBe("active");
  });
});
