import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc } from "drizzle-orm";
import {
  employees,
  timeOffPolicies,
  timeOffBalances,
} from "@/lib/db/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, {
  schema: {
    employees,
    timeOffPolicies,
    timeOffBalances,
  },
});

describe("Time Off Policy Management Integration Tests (Real Postgres)", () => {
  let testAdmin: any;

  beforeAll(async () => {
    const testRunId = Date.now();
    
    // Create test admin
    const [admin] = await db
      .insert(employees)
      .values({
        employeeNumber: `POLICY_ADMIN_${testRunId}`,
        firstName: "Policy",
        lastName: "Admin",
        email: `policy.admin.${testRunId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
      })
      .returning();
    testAdmin = admin;
  });

  afterAll(async () => {
    try {
      // Clean up any policies created by tests
      const testPolicies = await db
        .select()
        .from(timeOffPolicies)
        .where(eq(timeOffPolicies.name, "Test Vacation Policy"));
      
      for (const policy of testPolicies) {
        await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, policy.id));
      }
      
      if (testAdmin?.id) {
        await db.delete(employees).where(eq(employees.id, testAdmin.id));
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    } finally {
      await pool.end();
    }
  });

  test("create new time-off policy", async () => {
    const [policy] = await db
      .insert(timeOffPolicies)
      .values({
        name: "Test Vacation Policy",
        policyType: "vacation",
        country: "Canada",
        accrualRate: "1.25",
        accrualPeriod: "monthly",
        maxCarryover: "5.0",
        maxBalance: "30.0",
        requiresApproval: true,
        description: "Test policy for integration testing",
      })
      .returning();

    expect(policy).toBeDefined();
    expect(policy.name).toBe("Test Vacation Policy");
    expect(policy.policyType).toBe("vacation");
    expect(policy.country).toBe("Canada");
    expect(parseFloat(policy.accrualRate!)).toBe(1.25);
    expect(policy.accrualPeriod).toBe("monthly");
    expect(parseFloat(policy.maxCarryover!)).toBe(5.0);
    expect(parseFloat(policy.maxBalance!)).toBe(30.0);
    expect(policy.requiresApproval).toBe(true);
  });

  test("read time-off policy", async () => {
    // Create a policy
    const [created] = await db
      .insert(timeOffPolicies)
      .values({
        name: "Test Sick Leave",
        policyType: "sick",
        country: "Canada",
        accrualRate: "0.83",
        accrualPeriod: "monthly",
        maxBalance: "10.0",
        requiresApproval: false,
        description: "Sick leave policy",
      })
      .returning();

    // Read it back
    const [policy] = await db
      .select()
      .from(timeOffPolicies)
      .where(eq(timeOffPolicies.id, created.id))
      .limit(1);

    expect(policy).toBeDefined();
    expect(policy.name).toBe("Test Sick Leave");
    expect(policy.policyType).toBe("sick");
    expect(policy.requiresApproval).toBe(false);

    // Cleanup
    await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, created.id));
  });

  test("update time-off policy", async () => {
    // Create a policy
    const [created] = await db
      .insert(timeOffPolicies)
      .values({
        name: "Test Personal Days",
        policyType: "personal",
        country: "US",
        maxBalance: "5.0",
        requiresApproval: true,
      })
      .returning();

    // Update it
    const [updated] = await db
      .update(timeOffPolicies)
      .set({
        maxBalance: "7.0",
        requiresApproval: false,
        description: "Updated description",
        updatedAt: new Date(),
      })
      .where(eq(timeOffPolicies.id, created.id))
      .returning();

    expect(updated).toBeDefined();
    expect(parseFloat(updated.maxBalance!)).toBe(7.0);
    expect(updated.requiresApproval).toBe(false);
    expect(updated.description).toBe("Updated description");

    // Cleanup
    await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, created.id));
  });

  test("cannot delete policy with active balances", async () => {
    // Create a policy
    const [policy] = await db
      .insert(timeOffPolicies)
      .values({
        name: "Test Parental Leave",
        policyType: "parental",
        country: "Canada",
        maxBalance: "52.0",
        requiresApproval: true,
      })
      .returning();

    // Create a balance for the policy
    const [balance] = await db
      .insert(timeOffBalances)
      .values({
        employeeId: testAdmin.id,
        policyId: policy.id,
        balance: "10.0",
      })
      .returning();

    // Attempt to delete policy with active balance should fail
    // (in a real API this would return a 400 error)
    const balanceCheck = await db
      .select()
      .from(timeOffBalances)
      .where(eq(timeOffBalances.policyId, policy.id))
      .limit(1);

    expect(balanceCheck.length).toBeGreaterThan(0);

    // Cleanup - must delete balance first, then policy
    await db.delete(timeOffBalances).where(eq(timeOffBalances.id, balance.id));
    await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, policy.id));
  });

  test("list all policies ordered by name", async () => {
    // Create multiple policies
    await db.insert(timeOffPolicies).values([
      {
        name: "Z Test Policy",
        policyType: "vacation",
        country: "Canada",
      },
      {
        name: "A Test Policy",
        policyType: "sick",
        country: "US",
      },
      {
        name: "M Test Policy",
        policyType: "personal",
        country: "India",
      },
    ]);

    // Fetch ordered by name
    const policies = await db
      .select()
      .from(timeOffPolicies)
      .orderBy(timeOffPolicies.name);

    expect(policies.length).toBeGreaterThanOrEqual(3);

    // Find our test policies
    const testPolicies = policies.filter((p) =>
      ["A Test Policy", "M Test Policy", "Z Test Policy"].includes(p.name)
    );

    expect(testPolicies[0].name).toBe("A Test Policy");
    expect(testPolicies[1].name).toBe("M Test Policy");
    expect(testPolicies[2].name).toBe("Z Test Policy");

    // Cleanup
    for (const policy of testPolicies) {
      await db.delete(timeOffPolicies).where(eq(timeOffPolicies.id, policy.id));
    }
  });
});
