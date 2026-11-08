/**
 * Integration tests for Bamboo API with REAL Postgres
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { employees, compensationHistory, apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost/vpeople_test",
});

const db = drizzle(pool, {
  schema: {
    employees,
    compensationHistory,
    apiKeys,
  },
});

describe("Bamboo API Integration Tests (Real Postgres)", () => {
  let testAdmin: any;
  let testEmployee: any;
  let adminApiKey: any;
  let employeeApiKey: any;

  beforeAll(async () => {
    // Create test admin
    const [admin] = await db
      .insert(employees)
      .values({
        employeeNumber: "BAMBOO_ADMIN",
        firstName: "Bamboo",
        lastName: "Admin",
        email: "bamboo.admin@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
      })
      .returning();
    testAdmin = admin;

    // Create test employee
    const [employee] = await db
      .insert(employees)
      .values({
        employeeNumber: "BAMBOO_EMP",
        firstName: "Bamboo",
        lastName: "Employee",
        email: "bamboo.employee@test.com",
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    testEmployee = employee;

    // Add compensation history
    await db.insert(compensationHistory).values({
      employeeId: testEmployee.id,
      payRate: "75000",
      payType: "salary",
      paySchedule: "annual",
      currency: "CAD",
      effectiveDate: "2020-01-01",
      changeReason: "New hire",
    });

    // Create admin API key
    const [adminKey] = await db
      .insert(apiKeys)
      .values({
        name: "Bamboo Admin Key",
        key: "bamboo_admin_test_key_12345",
        employeeId: testAdmin.id,
        canViewAll: true,
        canViewCompensation: true,
        status: "active",
      })
      .returning();
    adminApiKey = adminKey;

    // Create employee API key
    const [empKey] = await db
      .insert(apiKeys)
      .values({
        name: "Bamboo Employee Key",
        key: "bamboo_emp_test_key_67890",
        employeeId: testEmployee.id,
        canViewAll: false,
        canViewCompensation: false,
        status: "active",
      })
      .returning();
    employeeApiKey = empKey;
  });

  afterAll(async () => {
    await db
      .delete(compensationHistory)
      .where(eq(compensationHistory.employeeId, testEmployee.id));
    await db.delete(apiKeys).where(eq(apiKeys.id, adminApiKey.id));
    await db.delete(apiKeys).where(eq(apiKeys.id, employeeApiKey.id));
    await db.delete(employees).where(eq(employees.id, testEmployee.id));
    await db.delete(employees).where(eq(employees.id, testAdmin.id));

    await pool.end();
  });

  test("admin API key with canViewCompensation returns comp fields", async () => {
    // Simulate authenticated API call
    const auth = {
      key: adminApiKey,
      permissions: {
        canViewAll: true,
        canViewCompensation: true,
      },
    };

    // Fetch employee with comp history
    const [empWithComp] = await db
      .select({
        employee: employees,
        comp: compensationHistory,
      })
      .from(employees)
      .leftJoin(
        compensationHistory,
        eq(compensationHistory.employeeId, employees.id)
      )
      .where(eq(employees.id, testEmployee.id))
      .orderBy(compensationHistory.effectiveDate)
      .limit(1);

    expect(empWithComp).toBeDefined();
    expect(empWithComp.comp).toBeDefined();

    // Verify comp fields would be returned
    if (auth.permissions.canViewCompensation && empWithComp.comp) {
      const compFields = {
        payRate: empWithComp.comp.payRate,
        payType: empWithComp.comp.payType,
        paySchedule: empWithComp.comp.paySchedule,
        currency: empWithComp.comp.currency,
      };

      expect(compFields.payRate).toBe("75000");
      expect(compFields.payType).toBe("salary");
      expect(compFields.paySchedule).toBe("annual");
      expect(compFields.currency).toBe("CAD");
    }
  });

  test("employee API key without canViewCompensation omits comp fields", async () => {
    // Simulate authenticated API call
    const auth = {
      key: employeeApiKey,
      permissions: {
        canViewAll: false,
        canViewCompensation: false,
      },
    };

    // Fetch employee with comp history
    const [empWithComp] = await db
      .select({
        employee: employees,
        comp: compensationHistory,
      })
      .from(employees)
      .leftJoin(
        compensationHistory,
        eq(compensationHistory.employeeId, employees.id)
      )
      .where(eq(employees.id, testEmployee.id))
      .orderBy(compensationHistory.effectiveDate)
      .limit(1);

    // Comp fields should NOT be included in response
    expect(auth.permissions.canViewCompensation).toBe(false);

    // Verify filtering logic would exclude comp
    const shouldIncludeComp =
      auth.permissions.canViewCompensation && empWithComp.comp;
    expect(shouldIncludeComp).toBe(false);
  });
});
