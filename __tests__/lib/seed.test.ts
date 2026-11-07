import { describe, it, expect, beforeAll } from "@jest/globals";
import { runSeed } from "@/lib/seed";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

describe("runSeed idempotency", () => {
  beforeAll(async () => {
    await runSeed({ reset: true });
  });

  it("should be idempotent when run twice", async () => {
    const firstRun = await runSeed({ reset: false });
    expect(firstRun.success).toBe(true);

    const afterFirst = {
      employees: await db.$count(schema.employees),
      departments: await db.$count(schema.departments),
      divisions: await db.$count(schema.divisions),
      teams: await db.$count(schema.teams),
      locations: await db.$count(schema.locations),
      jobFamilies: await db.$count(schema.jobFamilies),
      jobLevels: await db.$count(schema.jobLevels),
      policies: await db.$count(schema.timeOffPolicies),
      seats: await db.$count(schema.seats),
      taskTemplates: await db.$count(schema.taskTemplates),
    };

    const secondRun = await runSeed({ reset: false });
    expect(secondRun.success).toBe(true);

    const afterSecond = {
      employees: await db.$count(schema.employees),
      departments: await db.$count(schema.departments),
      divisions: await db.$count(schema.divisions),
      teams: await db.$count(schema.teams),
      locations: await db.$count(schema.locations),
      jobFamilies: await db.$count(schema.jobFamilies),
      jobLevels: await db.$count(schema.jobLevels),
      policies: await db.$count(schema.timeOffPolicies),
      seats: await db.$count(schema.seats),
      taskTemplates: await db.$count(schema.taskTemplates),
    };

    expect(afterSecond).toEqual(afterFirst);
  });

  it("should handle partial seeding (like production scenario)", async () => {
    await runSeed({ reset: true });

    const initialCounts = {
      employees: await db.$count(schema.employees),
      departments: await db.$count(schema.departments),
      divisions: await db.$count(schema.divisions),
    };

    expect(initialCounts.employees).toBeGreaterThan(0);
    expect(initialCounts.departments).toBeGreaterThan(0);
    expect(initialCounts.divisions).toBeGreaterThan(0);

    const secondRunResult = await runSeed({ reset: false });
    expect(secondRunResult.success).toBe(true);

    const finalCounts = {
      employees: await db.$count(schema.employees),
      departments: await db.$count(schema.departments),
      divisions: await db.$count(schema.divisions),
    };

    expect(finalCounts).toEqual(initialCounts);
  });
});
