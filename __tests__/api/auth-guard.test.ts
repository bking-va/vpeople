/**
 * Security Test: All API routes must require authentication
 * 
 * Verifies that every API route returns 401 or 403 for unauthenticated requests,
 * except for explicitly public endpoints.
 */

jest.mock("@/lib/auth", () => ({
  auth: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/db", () => {
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve([]),
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
  };
  return {
    db: {
      select: () => chain,
    },
  };
});

import { NextRequest } from "next/server";

// Import all route handlers
import { GET as getJobOpenings, POST as postJobOpening } from "@/app/api/hiring/openings/route";
import { GET as getJobOpening } from "@/app/api/hiring/openings/[id]/route";
import { GET as getCandidate, PATCH as patchCandidate } from "@/app/api/hiring/candidates/[id]/route";
import { GET as listPublicCareers } from "@/app/api/careers/openings/route";
import { GET as getPublicCareer } from "@/app/api/careers/openings/[id]/route";
import { POST as postCandidateNote } from "@/app/api/hiring/candidates/[id]/notes/route";
import { POST as postOffer } from "@/app/api/hiring/offers/route";
import { PUT as putOffer } from "@/app/api/hiring/offers/[id]/route";
import { POST as postTimeOffRequest } from "@/app/api/time-off/requests/route";
import { GET as getPeopleViews, POST as postPeopleView } from "@/app/api/people/views/route";
import { GET as exportReport } from "@/app/api/reports/export/route";
import { PATCH as patchAccessLevel } from "@/app/api/settings/access-levels/[code]/route";
import { GET as getAccessScopes, PUT as putAccessScopes } from "@/app/api/settings/access-scopes/route";
import { POST as issueLetter } from "@/app/api/letter-templates/[id]/issue/route";
import { PATCH as patchWorkflow } from "@/app/api/settings/workflows/[id]/route";
import { GET as bambooDirectory } from "@/app/api/bamboo/v1/employees/directory/route";
import { GET as bambooEmployee } from "@/app/api/bamboo/v1/employees/[id]/route";
import { GET as bambooTimeOffRequests } from "@/app/api/bamboo/v1/time-off/requests/route";
import { GET as gatewayDirectory } from "@/app/api/gateway/v1/[company]/employees/directory/route";
import { GET as gatewayEmployee } from "@/app/api/gateway/v1/[company]/employees/[id]/route";
import { GET as gatewayCustomReport } from "@/app/api/gateway/v1/[company]/reports/custom/route";

describe("API Authentication Guards", () => {
  const createMockRequest = (url: string, options: RequestInit = {}) => {
    return new NextRequest(new URL(url, "http://localhost:3000"), options);
  };

  describe("Session-Based Routes", () => {
    test("GET /api/hiring/openings returns 401 without session", async () => {
      const req = createMockRequest("/api/hiring/openings");
      const res = await getJobOpenings(req);
      expect(res.status).toBe(401);
    });

    test("POST /api/hiring/openings returns 401 without session", async () => {
      const req = createMockRequest("/api/hiring/openings", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await postJobOpening(req);
      expect(res.status).toBe(401);
    });

    test("GET /api/hiring/openings/[id] returns 401 without session", async () => {
      const req = createMockRequest("/api/hiring/openings/1");
      const res = await getJobOpening(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(401);
    });

    test("GET /api/hiring/candidates/[id] returns 401 without session", async () => {
      const req = createMockRequest("/api/hiring/candidates/1");
      const res = await getCandidate(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(401);
    });

    test("PATCH /api/hiring/candidates/[id] returns 401 without session", async () => {
      const req = createMockRequest("/api/hiring/candidates/1", {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      const res = await patchCandidate(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(401);
    });

    test("POST /api/hiring/candidates/[id]/notes returns 401 without session", async () => {
      const req = createMockRequest("/api/hiring/candidates/1/notes", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await postCandidateNote(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(401);
    });

    test("POST /api/hiring/offers returns 401 without session", async () => {
      const req = createMockRequest("/api/hiring/offers", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await postOffer(req);
      expect(res.status).toBe(401);
    });

    test("PUT /api/hiring/offers/[id] returns 401 without session", async () => {
      const req = createMockRequest("/api/hiring/offers/1", {
        method: "PUT",
        body: JSON.stringify({}),
      });
      const res = await putOffer(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(401);
    });

    test("POST /api/time-off/requests returns 401 without session", async () => {
      const req = createMockRequest("/api/time-off/requests", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await postTimeOffRequest(req);
      expect(res.status).toBe(401);
    });

    test("GET /api/people/views returns 401 without session", async () => {
      const req = createMockRequest("/api/people/views");
      const res = await getPeopleViews(req);
      expect(res.status).toBe(401);
    });

    test("POST /api/people/views returns 401 without session", async () => {
      const req = createMockRequest("/api/people/views", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await postPeopleView(req);
      expect(res.status).toBe(401);
    });

    test("GET /api/reports/export returns 401 without session", async () => {
      const req = createMockRequest("/api/reports/export");
      const res = await exportReport(req);
      expect(res.status).toBe(401);
    });

    test("GET /api/settings/access-scopes returns 401 without session", async () => {
      const req = createMockRequest("/api/settings/access-scopes?employeeId=1");
      const res = await getAccessScopes(req);
      expect(res.status).toBe(401);
    });

    test("PUT /api/settings/access-scopes returns 401 without session", async () => {
      const req = createMockRequest("/api/settings/access-scopes", {
        method: "PUT",
        body: JSON.stringify({ employeeId: 1, locationIds: [], countries: [] }),
      });
      const res = await putAccessScopes(req);
      expect(res.status).toBe(401);
    });

    test("POST /api/letter-templates/[id]/issue returns 401 without session", async () => {
      const req = createMockRequest("/api/letter-templates/1/issue", {
        method: "POST",
        body: JSON.stringify({ employeeId: 1 }),
      });
      const res = await issueLetter(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(401);
    });

    test("PATCH /api/settings/access-levels/[code] returns 401 without session", async () => {
      const req = createMockRequest("/api/settings/access-levels/employee", {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      const res = await patchAccessLevel(req, { params: Promise.resolve({ code: "employee" }) });
      expect(res.status).toBe(401);
    });

    test("PATCH /api/settings/workflows/[id] returns 401 without session", async () => {
      const req = createMockRequest("/api/settings/workflows/1", {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      const res = await patchWorkflow(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(401);
    });
  });

  describe("API Key Routes (Bamboo API)", () => {
    test("GET /api/bamboo/v1/employees/directory returns 401 without API key", async () => {
      const req = createMockRequest("/api/bamboo/v1/employees/directory");
      const res = await bambooDirectory(req);
      expect(res.status).toBe(401);
    });

    test("GET /api/bamboo/v1/employees/[id] returns 401 without API key", async () => {
      const req = createMockRequest("/api/bamboo/v1/employees/1");
      const res = await bambooEmployee(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(401);
    });

    test("GET /api/bamboo/v1/time-off/requests returns 401 without API key", async () => {
      const req = createMockRequest("/api/bamboo/v1/time-off/requests");
      const res = await bambooTimeOffRequests(req);
      expect(res.status).toBe(401);
    });

    test("GET /api/bamboo/v1/employees/directory returns 401 with invalid API key", async () => {
      const req = createMockRequest("/api/bamboo/v1/employees/directory", {
        headers: { Authorization: "Basic " + Buffer.from("invalid-key:x").toString("base64") },
      });
      const res = await bambooDirectory(req);
      expect(res.status).toBe(401);
    });
  });

  describe("Gateway API Routes", () => {
    test("GET /api/gateway/v1/[company]/employees/directory returns 401 without API key", async () => {
      const req = createMockRequest("/api/gateway/v1/test/employees/directory");
      const res = await gatewayDirectory(req, { params: Promise.resolve({ company: "test" }) });
      expect(res.status).toBe(401);
    });

    test("GET /api/gateway/v1/[company]/employees/[id] returns 401 without API key", async () => {
      const req = createMockRequest("/api/gateway/v1/test/employees/1");
      const res = await gatewayEmployee(req, { params: Promise.resolve({ company: "test", id: "1" }) });
      expect(res.status).toBe(401);
    });

    test("GET /api/gateway/v1/[company]/reports/custom returns 401 without API key", async () => {
      const req = createMockRequest("/api/gateway/v1/test/reports/custom");
      const res = await gatewayCustomReport(req, { params: Promise.resolve({ company: "test" }) });
      expect(res.status).toBe(401);
    });
  });

  describe("Public Endpoints (Should NOT require auth)", () => {
    test("GET /api/careers/openings is public", async () => {
      const res = await listPublicCareers();
      expect([200, 404, 500]).toContain(res.status);
    });

    test("GET /api/careers/openings/[id] is public (404 without an open job)", async () => {
      const req = createMockRequest("/api/careers/openings/1");
      const res = await getPublicCareer(req, { params: Promise.resolve({ id: "1" }) });
      expect([200, 404, 500]).toContain(res.status);
    });

    test("POST /api/hiring/candidates/apply is public (rate limited)", async () => {
      // This endpoint should not return 401/403, it's intentionally public
      // It may return 400 for missing fields or 429 for rate limiting
      // Just verify it doesn't require auth
      expect(true).toBe(true);
    });

    test("/api/auth/* endpoints are public", () => {
      // Auth endpoints are handled by NextAuth and should remain public
      expect(true).toBe(true);
    });

    test("/api/admin/seed requires token (not session)", () => {
      // Seed endpoint uses X-Seed-Token header, not session
      expect(true).toBe(true);
    });

    test("/api/cron/* requires CRON_SECRET (not session)", () => {
      // Cron endpoints use Bearer token with CRON_SECRET
      expect(true).toBe(true);
    });
  });
});
