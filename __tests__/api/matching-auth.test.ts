jest.mock("@/lib/auth", () => ({
  auth: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/db", () => {
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve([]),
    orderBy: () => Promise.resolve([]),
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
  };
  return {
    db: {
      select: () => chain,
      insert: () => ({ values: () => ({ returning: () => Promise.resolve([]), onConflictDoUpdate: () => Promise.resolve(), onConflictDoNothing: () => Promise.resolve() }) }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
      delete: () => ({ where: () => Promise.resolve() }),
      execute: () => Promise.resolve([]),
    },
  };
});

jest.mock("@/lib/matching/geocode", () => ({
  loadGeocodeIndexes: () => ({
    citiesByNameCountry: new Map(),
    citiesByNameAdminCountry: new Map(),
    postal: new Map(),
  }),
  geocodeLocation: () => null,
}));

import { NextRequest } from "next/server";
import { POST as postMatch } from "@/app/api/hiring/match/route";
import { POST as postOpeningMatch } from "@/app/api/hiring/openings/[id]/match/route";
import { GET as getCustomerLocations, POST as postCustomerLocations } from "@/app/api/settings/customer-locations/route";

describe("candidate matching auth", () => {
  const req = (url: string, init?: RequestInit) =>
    new NextRequest(new URL(url, "http://localhost:3000"), init);

  test("POST /api/hiring/match returns 401 without session", async () => {
    const res = await postMatch(req("/api/hiring/match", { method: "POST", body: JSON.stringify({}) }));
    expect(res.status).toBe(401);
  });

  test("POST /api/hiring/openings/[id]/match returns 401 without session", async () => {
    const res = await postOpeningMatch(
      req("/api/hiring/openings/1/match", { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: "1" }) }
    );
    expect(res.status).toBe(401);
  });

  test("GET /api/settings/customer-locations returns 401 without session", async () => {
    const res = await getCustomerLocations();
    expect(res.status).toBe(401);
  });

  test("POST /api/settings/customer-locations returns 401 without session", async () => {
    const res = await postCustomerLocations(
      req("/api/settings/customer-locations", { method: "POST", body: JSON.stringify({ label: "x", country: "Canada" }) })
    );
    expect(res.status).toBe(401);
  });
});
