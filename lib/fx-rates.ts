import { db } from "@/lib/db";
import { fxDailyRates } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import {
  BOC_FX_DAILY_URL,
  FX_SOURCE,
  type FxRateMap,
  fxRateMapFromRows,
  parseBocDailyRates,
} from "@/lib/fx";

export async function getLatestFxRates(): Promise<FxRateMap> {
  const rows = await db
    .select({
      currency: fxDailyRates.currency,
      cadPerUnit: fxDailyRates.cadPerUnit,
      rateDate: fxDailyRates.rateDate,
      source: fxDailyRates.source,
    })
    .from(fxDailyRates);

  return fxRateMapFromRows(
    rows.map((row) => ({
      currency: row.currency,
      cadPerUnit: Number.parseFloat(row.cadPerUnit),
      rateDate: row.rateDate,
      source: row.source || FX_SOURCE,
    }))
  );
}

export async function refreshFxRates(opts?: {
  fetchImpl?: typeof fetch;
}): Promise<{ fetched: number; upserted: number; rateDates: string[] }> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const response = await fetchImpl(BOC_FX_DAILY_URL, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Bank of Canada Valet request failed (${response.status})`);
  }

  const payload = await response.json();
  const parsed = parseBocDailyRates(payload);
  if (parsed.length === 0) {
    return { fetched: 0, upserted: 0, rateDates: [] };
  }

  const now = new Date();
  await db
    .insert(fxDailyRates)
    .values(
      parsed.map((row) => ({
        currency: row.currency,
        cadPerUnit: String(row.cadPerUnit),
        rateDate: row.rateDate,
        source: row.source,
        fetchedAt: now,
      }))
    )
    .onConflictDoUpdate({
      target: [fxDailyRates.currency, fxDailyRates.rateDate],
      set: {
        cadPerUnit: sql`excluded.cad_per_unit`,
        source: sql`excluded.source`,
        fetchedAt: now,
      },
    });

  return {
    fetched: parsed.length,
    upserted: parsed.length,
    rateDates: [...new Set(parsed.map((row) => row.rateDate))].sort(),
  };
}
