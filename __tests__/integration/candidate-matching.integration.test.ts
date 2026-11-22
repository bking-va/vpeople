import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accessLevels,
  auditLogs,
  candidateMatchRuns,
  candidates,
  customerLocations,
  employees,
  jobOpenings,
  locations,
} from "@/lib/db/schema";
import { matchingActorForEmail } from "@/lib/matching/access";
import { runCandidateMatch } from "@/lib/matching/search";
import { parseMatchFilters } from "@/lib/matching/filters";

describe("AI candidate matching (Real Postgres)", () => {
  const runId = Date.now();
  const ids = {
    employees: [] as number[],
    locations: [] as number[],
    openings: [] as number[],
    candidates: [] as number[],
    customers: [] as number[],
    runs: [] as number[],
  };

  afterAll(async () => {
    if (ids.runs.length) {
      await db.delete(candidateMatchRuns).where(inArray(candidateMatchRuns.id, ids.runs));
    }
    if (ids.employees.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.employeeId, ids.employees));
    }
    if (ids.candidates.length) {
      await db.delete(candidates).where(inArray(candidates.id, ids.candidates));
    }
    if (ids.openings.length) {
      await db.delete(jobOpenings).where(inArray(jobOpenings.id, ids.openings));
    }
    if (ids.customers.length) {
      await db.delete(customerLocations).where(inArray(customerLocations.id, ids.customers));
    }
    if (ids.employees.length) {
      await db.delete(employees).where(inArray(employees.id, ids.employees));
    }
    if (ids.locations.length) {
      await db.delete(locations).where(inArray(locations.id, ids.locations));
    }
  });

  test("admins get advisory ranked matches, audit without résumé text, and regular staff are denied", async () => {
    await db
      .insert(accessLevels)
      .values({
        name: `Match Admin ${runId}`,
        code: "full_admin",
        canManageUsers: true,
        canViewCompensation: true,
        canEditCompensation: true,
        canViewSensitivePersonalInfo: true,
        canEditSensitivePersonalInfo: true,
        canViewBankInfo: true,
        canEditBankInfo: true,
        canManageSettings: true,
        canApproveTimeOff: true,
        canApproveCompensationChanges: true,
      })
      .onConflictDoNothing();

    const [office] = await db
      .insert(locations)
      .values({
        name: `Match HQ ${runId}`,
        city: "Saskatoon",
        province: "Saskatchewan",
        country: "Canada",
        postalCode: "S7K 2M2",
      })
      .returning();
    ids.locations.push(office.id);

    const [admin] = await db
      .insert(employees)
      .values({
        employeeNumber: `MATCH_ADM_${runId}`,
        firstName: "Match",
        lastName: "Admin",
        email: `match.admin.${runId}@vendasta.com`,
        jobTitle: "CEO",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
        locationId: office.id,
        addressCity: "Saskatoon",
        addressProvince: "SK",
        addressCountry: "Canada",
        addressPostalCode: "S7K 1A1",
      })
      .returning();
    ids.employees.push(admin.id);

    const [engineer] = await db
      .insert(employees)
      .values({
        employeeNumber: `MATCH_ENG_${runId}`,
        firstName: "Ty",
        lastName: "Script",
        email: `match.eng.${runId}@vendasta.com`,
        jobTitle: "Staff TypeScript Engineer",
        employmentStatus: "full_time",
        accessLevel: "employee",
        locationId: office.id,
        addressCity: "Saskatoon",
        addressProvince: "SK",
        addressCountry: "Canada",
        githubUrl: "https://github.com/example-ts",
      })
      .returning();
    ids.employees.push(engineer.id);

    const [outsider] = await db
      .insert(employees)
      .values({
        employeeNumber: `MATCH_OUT_${runId}`,
        firstName: "Reg",
        lastName: "ular",
        email: `match.out.${runId}@vendasta.com`,
        jobTitle: "Coordinator",
        employmentStatus: "full_time",
        accessLevel: "employee",
        locationId: office.id,
      })
      .returning();
    ids.employees.push(outsider.id);

    const [opening] = await db
      .insert(jobOpenings)
      .values({
        title: `TypeScript Engineer ${runId}`,
        employmentType: "full_time",
        status: "open",
        description: "Build Next.js apps in TypeScript.",
        requirements: "TypeScript, Postgres, Next.js",
        locationId: office.id,
        locationRequirement: "none",
        locationMaxDistanceKm: 50,
        locationWeight: 0,
      })
      .returning();
    ids.openings.push(opening.id);

    const [applicant] = await db
      .insert(candidates)
      .values({
        jobOpeningId: opening.id,
        firstName: "Pat",
        lastName: "Applicant",
        email: `match.app.${runId}@example.com`,
        coverLetter: "I have shipped TypeScript services on Postgres.",
        addressCity: "Saskatoon",
        addressProvince: "SK",
        addressCountry: "Canada",
        stage: "interview",
        source: "direct",
      })
      .returning();
    ids.candidates.push(applicant.id);

    const [customer] = await db
      .insert(customerLocations)
      .values({
        label: `Prairies ${runId}`,
        city: "Saskatoon",
        province: "Saskatchewan",
        country: "Canada",
        postalCode: "S7K",
        source: "csv",
      })
      .returning();
    ids.customers.push(customer.id);

    const outsiderActor = await matchingActorForEmail(outsider.email);
    expect(outsiderActor?.allowed).toBe(false);

    const actor = await matchingActorForEmail(admin.email);
    expect(actor?.allowed).toBe(true);
    expect(actor?.canManageAllHiring).toBe(true);

    const result = await runCandidateMatch({
      actor: actor!,
      roleQuery: "Staff TypeScript engineer for Next.js and Postgres",
      jobOpeningId: opening.id,
      jobTitle: opening.title,
      filters: parseMatchFilters({ locationRequirement: "none" }),
      transport: async () => ({
        content: [
          {
            type: "tool_use",
            name: "submit_match_scores",
            input: {
              scores: [
                {
                  candidateKey: `employee:${engineer.id}`,
                  score: 88,
                  reasons: ["Current title: Staff TypeScript Engineer"],
                },
                {
                  candidateKey: `applicant:${applicant.id}`,
                  score: 74,
                  reasons: ["Cover letter cites TypeScript and Postgres"],
                },
              ],
            },
          },
        ],
        usage: { input_tokens: 120, output_tokens: 30 },
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.advisory).toMatch(/human/i);
    expect(result.result.results.length).toBeGreaterThan(0);
    const keys = result.result.results.map((row) => row.key);
    expect(keys.some((key) => key.includes(String(engineer.id)) || key.includes(String(applicant.id)))).toBe(
      true
    );
    const json = JSON.stringify(result.result);
    expect(json).not.toMatch(/123 Main|gender|ssn|sin/i);

    const runs = await db
      .select()
      .from(candidateMatchRuns)
      .where(eq(candidateMatchRuns.employeeId, admin.id));
    expect(runs.length).toBeGreaterThan(0);
    ids.runs.push(...runs.map((row) => row.id));
    expect(JSON.stringify(runs[0])).not.toMatch(/cover letter I have shipped/i);

    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.employeeId, admin.id));
    const matchLog = logs.find((row) => row.action === "candidate_match_search");
    expect(matchLog).toBeTruthy();
    expect(JSON.stringify(matchLog?.changes)).not.toMatch(/I have shipped TypeScript/);
    expect(JSON.stringify(matchLog?.changes)).toMatch(/resultKeys/);
  });
});
