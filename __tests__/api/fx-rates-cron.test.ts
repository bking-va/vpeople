jest.mock("@/lib/fx-rates", () => ({
  refreshFxRates: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/refresh-fx-rates/route";
import { refreshFxRates } from "@/lib/fx-rates";

const mockedRefresh = refreshFxRates as jest.MockedFunction<typeof refreshFxRates>;

describe("GET /api/cron/refresh-fx-rates", () => {
  const previousSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
    jest.clearAllMocks();
  });

  test("rejects missing or wrong CRON_SECRET without refreshing rates", async () => {
    delete process.env.CRON_SECRET;
    const unauthorized = await GET(
      new NextRequest("http://localhost/api/cron/refresh-fx-rates", {
        headers: { authorization: "Bearer undefined" },
      })
    );
    expect(unauthorized.status).toBe(401);
    expect(mockedRefresh).not.toHaveBeenCalled();

    process.env.CRON_SECRET = "fx-secret";
    const wrong = await GET(
      new NextRequest("http://localhost/api/cron/refresh-fx-rates", {
        headers: { authorization: "Bearer other" },
      })
    );
    expect(wrong.status).toBe(401);
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  test("authorized cron refreshes Bank of Canada rates and does not run Bamboo sync", async () => {
    process.env.CRON_SECRET = "fx-secret";
    mockedRefresh.mockResolvedValue({
      fetched: 3,
      upserted: 3,
      rateDates: ["2026-11-20"],
    });
    const res = await GET(
      new NextRequest("http://localhost/api/cron/refresh-fx-rates", {
        headers: { authorization: "Bearer fx-secret" },
      })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      fetched: 3,
      upserted: 3,
      rateDates: ["2026-11-20"],
    });
    expect(mockedRefresh).toHaveBeenCalledTimes(1);
  });
});
