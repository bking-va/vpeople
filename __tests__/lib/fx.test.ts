import {
  BOC_FX_DAILY_URL,
  FX_SOURCE,
  collectCompensationCurrencies,
  compensationTableFieldCurrency,
  convertToUsd,
  csvUsdAmount,
  fxRateMapFromRows,
  fxRateMapOnLatestUsdDate,
  isCompensationTableMoneyField,
  parseAmount,
  parseBocDailyRates,
  usdEquivalentAttribution,
  usdEquivalentForVisiblePay,
} from "@/lib/fx";

const bocPayload = {
  observations: [
    { d: "2019-12-31", FXVNDCAD: { v: "0.000056" } },
    {
      d: "2026-11-20",
      FXUSDCAD: { v: "1.4325" },
      FXINRCAD: { v: "0.01546" },
      FXEURCAD: { v: "1.5727" },
      FXGBPCAD: { v: "1.8769" },
    },
    { d: "2026-04-30", FXRUBCAD: { v: "0.01819" } },
  ],
};

describe("Bank of Canada Valet parsing", () => {
  test("uses the latest dated observation per currency and ignores invalid values", () => {
    const rows = parseBocDailyRates({
      observations: [
        ...bocPayload.observations,
        { d: "2026-11-21", FXUSDCAD: { v: "0" } },
        { d: "not-a-date", FXUSDCAD: { v: "9" } },
        { d: "2026-11-19", FXUSDCAD: { v: "1.40" } },
      ],
    });
    const byCurrency = Object.fromEntries(rows.map((row) => [row.currency, row]));
    expect(byCurrency.USD).toMatchObject({
      cadPerUnit: 1.4325,
      rateDate: "2026-11-20",
      source: FX_SOURCE,
    });
    expect(byCurrency.INR).toMatchObject({
      cadPerUnit: 0.01546,
      rateDate: "2026-11-20",
    });
    expect(byCurrency.VND.rateDate).toBe("2019-12-31");
    expect(byCurrency.CAD).toBeUndefined();
  });

  test("returns nothing for malformed payloads rather than inventing rates", () => {
    expect(parseBocDailyRates(null)).toEqual([]);
    expect(parseBocDailyRates({})).toEqual([]);
    expect(parseBocDailyRates({ observations: [{ d: "2026-11-20", FXUSDCAD: { v: "nope" } }] })).toEqual(
      []
    );
  });

  test("points at the public Valet daily FX group", () => {
    expect(BOC_FX_DAILY_URL).toContain("bankofcanada.ca/valet/observations/group/FX_RATES_DAILY");
  });
});

describe("USD conversion through CAD", () => {
  const rates = fxRateMapFromRows(parseBocDailyRates(bocPayload));

  test("converts CAD, INR, and EUR using USD/CAD as the cross", () => {
    const cad = convertToUsd(143250, "CAD", rates)!;
    expect(cad.isIdentity).toBe(false);
    expect(cad.amountUsd).toBe(100000);
    expect(cad.rateDate).toBe("2026-11-20");
    expect(cad.source).toBe(FX_SOURCE);

    const inr = convertToUsd(1_000_000, "INR", rates)!;
    expect(inr.amountUsd).toBe(10792.32);
    expect(inr.fromCurrency).toBe("INR");

    const eur = convertToUsd(100, "eur", rates)!;
    expect(eur.amountUsd).toBe(109.79);
  });

  test("USD pay is an identity so the UI can skip a duplicate figure", () => {
    const usd = convertToUsd(90000, "USD", rates)!;
    expect(usd.isIdentity).toBe(true);
    expect(usd.amountUsd).toBe(90000);
    expect(csvUsdAmount(usd)).toBe("");
  });

  test("missing rates never fabricate a 1:1 fallback", () => {
    expect(convertToUsd(100, "CAD", new Map())).toBeNull();
    expect(convertToUsd(100, "INR", fxRateMapFromRows([{ currency: "USD", cadPerUnit: 1.4, rateDate: "2026-11-20", source: FX_SOURCE }]))).toBeNull();
    expect(convertToUsd(100, "XYZ", rates)).toBeNull();
    expect(convertToUsd("not-a-number", "CAD", rates)).toBeNull();
    expect(convertToUsd(null, "CAD", rates)).toBeNull();
    expect(parseAmount("5%")).toBeNull();
    expect(convertToUsd("5%", "CAD", rates)).toBeNull();
  });

  test("does not cross a stale foreign rate with a newer USD/CAD observation", () => {
    const mixed = fxRateMapFromRows([
      { currency: "USD", cadPerUnit: 1.4325, rateDate: "2026-11-20", source: FX_SOURCE },
      { currency: "INR", cadPerUnit: 0.015, rateDate: "2026-04-30", source: FX_SOURCE },
    ]);
    expect(convertToUsd(1_000_000, "INR", mixed)).toBeNull();
    expect(convertToUsd(143250, "CAD", mixed)?.amountUsd).toBe(100000);

    const aligned = fxRateMapOnLatestUsdDate([
      { currency: "USD", cadPerUnit: 1.4, rateDate: "2026-11-19", source: FX_SOURCE },
      { currency: "INR", cadPerUnit: 0.015, rateDate: "2026-11-19", source: FX_SOURCE },
      { currency: "USD", cadPerUnit: 1.4325, rateDate: "2026-11-20", source: FX_SOURCE },
      { currency: "INR", cadPerUnit: 0.01546, rateDate: "2026-11-20", source: FX_SOURCE },
      { currency: "VND", cadPerUnit: 0.000056, rateDate: "2019-12-31", source: FX_SOURCE },
    ]);
    expect(aligned.get("USD")?.rateDate).toBe("2026-11-20");
    expect(aligned.get("INR")?.rateDate).toBe("2026-11-20");
    expect(aligned.get("VND")).toBeUndefined();
    expect(convertToUsd(1_000_000, "INR", aligned)?.amountUsd).toBe(10792.32);
  });

  test("historical rows use the latest cached rate, not a per-effective-date rate", () => {
    const current = convertToUsd(100000, "CAD", rates)!;
    const historical = convertToUsd(100000, "CAD", rates)!;
    expect(historical.rateDate).toBe(current.rateDate);
    expect(historical.usdPerUnit).toBe(current.usdPerUnit);
    expect(usdEquivalentAttribution(historical, "CAD")).toBe(
      "≈ USD at 1 CAD = 0.6981 USD on 2026-11-20, Bank of Canada"
    );
  });
});

describe("USD pay follows the same visibility gate as local currency", () => {
  const rates = fxRateMapFromRows(parseBocDailyRates(bocPayload));

  test("hidden pay never yields a USD equivalent even when rates exist", () => {
    expect(
      usdEquivalentForVisiblePay({
        visible: false,
        amount: 180000,
        currency: "CAD",
        rates,
      })
    ).toBeNull();
    expect(
      usdEquivalentForVisiblePay({
        visible: false,
        amount: 90000,
        currency: "USD",
        rates,
      })
    ).toBeNull();
  });

  test("visible pay converts, including self-view without a manager flag", () => {
    const cad = usdEquivalentForVisiblePay({
      visible: true,
      amount: "143250.00",
      currency: "CAD",
      rates,
    });
    expect(cad?.amountUsd).toBe(100000);
    const usd = usdEquivalentForVisiblePay({
      visible: true,
      amount: 72000,
      currency: "USD",
      rates,
    });
    expect(usd?.isIdentity).toBe(true);
  });
});

describe("compensation table money fields and currencies in data", () => {
  test("detects bonus/commission amount fields and skips non-money keys", () => {
    expect(isCompensationTableMoneyField("amount")).toBe(true);
    expect(isCompensationTableMoneyField("customHousingAllowance")).toBe(true);
    expect(isCompensationTableMoneyField("annualBonus")).toBe(true);
    expect(isCompensationTableMoneyField("commissionAmount")).toBe(true);
    expect(isCompensationTableMoneyField("payRate")).toBe(true);
    expect(isCompensationTableMoneyField("businessUnit")).toBe(false);
    expect(isCompensationTableMoneyField("commissionPercent")).toBe(false);
    expect(isCompensationTableMoneyField("commissionRate")).toBe(false);
    expect(isCompensationTableMoneyField("currency")).toBe(false);
    expect(isCompensationTableMoneyField("id")).toBe(false);
  });

  test("uses row currency, then a code in the value, then CAD", () => {
    expect(compensationTableFieldCurrency({ currency: "INR" }, "1500")).toBe("INR");
    expect(compensationTableFieldCurrency({}, "$2,500.00 USD")).toBe("USD");
    expect(compensationTableFieldCurrency({}, "1500")).toBe("CAD");
  });

  test("finds CAD, USD, and INR in compensation, bonus, and table rows", () => {
    expect(
      collectCompensationCurrencies({
        compensation: [{ currency: "CAD" }, { currency: "USD" }, { currency: null }],
        bonuses: [{ currency: "INR" }],
        tableRows: [
          { rowData: { amount: "2500", currency: "CAD" } },
          { rowData: { amount: "$90,000.00 USD" } },
        ],
      })
    ).toEqual(["CAD", "INR", "USD"]);
  });
});
