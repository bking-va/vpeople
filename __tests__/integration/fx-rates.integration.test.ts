import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import {
  employees,
  compensationHistory,
  fxDailyRates,
} from "@/lib/db/schema";
import { FX_SOURCE } from "@/lib/fx";
import { getLatestFxRates, refreshFxRates } from "@/lib/fx-rates";
import { getSalaryHistoryReport } from "@/lib/reports/standard";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));
jest.mock("@/lib/permissions", () => ({
  getUserPermissions: jest.fn(),
  getSessionUserPermissions: jest.fn(),
}));

import { auth } from "@/lib/auth";
import { getSessionUserPermissions } from "@/lib/permissions";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const mockedPermissions = getSessionUserPermissions as jest.MockedFunction<
  typeof getSessionUserPermissions
>;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

function grantCompensation(allowed: boolean) {
  mockedAuth.mockResolvedValue({
    user: { email: "fx.hr@test.com", role: "admin", employeeId: 1 },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  } as any);
  mockedPermissions.mockResolvedValue({ canViewCompensation: allowed } as any);
}

describe("FX daily rates and USD pay visibility (Real Postgres)", () => {
  const runId = Date.now();
  const ids = { employees: [] as number[], compensation: [] as number[] };

  afterAll(async () => {
    try {
      if (ids.compensation.length) {
        for (const id of ids.compensation) {
          await db.delete(compensationHistory).where(eq(compensationHistory.id, id));
        }
      }
      if (ids.employees.length) {
        for (const id of ids.employees) {
          await db.delete(employees).where(eq(employees.id, id));
        }
      }
      await db.delete(fxDailyRates).where(eq(fxDailyRates.rateDate, "2026-11-20"));
      await db.delete(fxDailyRates).where(eq(fxDailyRates.rateDate, "2026-11-19"));
    } finally {
      await pool.end();
    }
  });

  test("refresh caches Bank of Canada observations and uses the latest row per currency", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        observations: [
          {
            d: "2026-11-19",
            FXUSDCAD: { v: "1.4000" },
            FXINRCAD: { v: "0.01500" },
          },
          {
            d: "2026-11-20",
            FXUSDCAD: { v: "1.4325" },
            FXINRCAD: { v: "0.01546" },
          },
        ],
      }),
    });

    const result = await refreshFxRates({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.upserted).toBe(2);
    expect(result.rateDates).toEqual(["2026-11-20"]);

    const rates = await getLatestFxRates();
    expect(rates.get("USD")?.cadPerUnit).toBeCloseTo(1.4325);
    expect(rates.get("USD")?.rateDate).toBe("2026-11-20");
    expect(rates.get("INR")?.cadPerUnit).toBeCloseTo(0.01546);
    expect(rates.get("CAD")).toBeUndefined();
  });

  test("USD equivalent on salary history follows canViewCompensation and skips USD duplicates", async () => {
    const [cadEmp] = await db
      .insert(employees)
      .values({
        employeeNumber: `FX_CAD_${runId}`,
        firstName: "Cad",
        lastName: "Pay",
        email: `fx.cad.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    const [usdEmp] = await db
      .insert(employees)
      .values({
        employeeNumber: `FX_USD_${runId}`,
        firstName: "Usd",
        lastName: "Pay",
        email: `fx.usd.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    const [inrEmp] = await db
      .insert(employees)
      .values({
        employeeNumber: `FX_INR_${runId}`,
        firstName: "Inr",
        lastName: "Pay",
        email: `fx.inr.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    const [gbpEmp] = await db
      .insert(employees)
      .values({
        employeeNumber: `FX_GBP_${runId}`,
        firstName: "Gbp",
        lastName: "Pay",
        email: `fx.gbp.${runId}@test.com`,
        hireDate: "2020-01-01",
        employmentStatus: "full_time",
      })
      .returning();
    ids.employees.push(cadEmp.id, usdEmp.id, inrEmp.id, gbpEmp.id);

    await db
      .insert(fxDailyRates)
      .values([
        {
          currency: "USD",
          cadPerUnit: "1.4325",
          rateDate: "2026-11-20",
          source: FX_SOURCE,
        },
        {
          currency: "INR",
          cadPerUnit: "0.01546",
          rateDate: "2026-11-20",
          source: FX_SOURCE,
        },
      ])
      .onConflictDoNothing();

    const [cadRow] = await db
      .insert(compensationHistory)
      .values({
        employeeId: cadEmp.id,
        effectiveDate: "2024-06-01",
        payRate: "143250",
        payType: "salary",
        currency: "CAD",
      })
      .returning();
    const [usdRow] = await db
      .insert(compensationHistory)
      .values({
        employeeId: usdEmp.id,
        effectiveDate: "2024-06-01",
        payRate: "90000",
        payType: "salary",
        currency: "USD",
      })
      .returning();
    const [inrRow] = await db
      .insert(compensationHistory)
      .values({
        employeeId: inrEmp.id,
        effectiveDate: "2023-01-01",
        payRate: "1000000",
        payType: "salary",
        currency: "INR",
      })
      .returning();
    const [gbpRow] = await db
      .insert(compensationHistory)
      .values({
        employeeId: gbpEmp.id,
        effectiveDate: "2024-06-01",
        payRate: "80000",
        payType: "salary",
        currency: "GBP",
      })
      .returning();
    ids.compensation.push(cadRow.id, usdRow.id, inrRow.id, gbpRow.id);

    grantCompensation(false);
    expect(await getSalaryHistoryReport()).toEqual([]);
    expect(await getSalaryHistoryReport({ canViewCompensation: false })).toEqual([]);

    grantCompensation(true);
    const history = await getSalaryHistoryReport({ canViewCompensation: true });
    const cad = history.find((row) => row.id === cadRow.id);
    const usd = history.find((row) => row.id === usdRow.id);
    const inr = history.find((row) => row.id === inrRow.id);
    const gbp = history.find((row) => row.id === gbpRow.id);

    expect(parseFloat(cad?.payRate || "0")).toBe(143250);
    expect(cad?.usdEquivalent?.amountUsd).toBe(100000);
    expect(cad?.usdEquivalent?.isIdentity).toBe(false);
    expect(cad?.usdEquivalent?.source).toBe(FX_SOURCE);
    expect(cad?.usdEquivalent?.rateDate).toBe("2026-11-20");

    expect(usd?.usdEquivalent?.isIdentity).toBe(true);
    expect(usd?.usdEquivalent?.amountUsd).toBe(90000);

    expect(inr?.usdEquivalent?.amountUsd).toBe(10792.32);
    expect(inr?.usdEquivalent?.rateDate).toBe(cad?.usdEquivalent?.rateDate);

    expect(parseFloat(gbp?.payRate || "0")).toBe(80000);
    expect(gbp?.usdEquivalent).toBeNull();
  });
});
