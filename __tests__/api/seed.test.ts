/**
 * @jest-environment node
 */

process.env.SEED_TOKEN = "test-seed-token";

import { POST } from "@/app/api/admin/seed/route";
import { runSeed } from "@/lib/seed";
import { NextRequest } from "next/server";

jest.mock("@/lib/seed");

const mockRunSeed = runSeed as jest.MockedFunction<typeof runSeed>;

describe("POST /api/admin/seed", () => {
  const SEED_TOKEN = "test-seed-token";

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SEED_TOKEN = SEED_TOKEN;
  });

  it("should return 404 when SEED_TOKEN is not configured", async () => {
    delete process.env.SEED_TOKEN;

    const request = new NextRequest("http://localhost:3000/api/admin/seed", {
      method: "POST",
      headers: {
        "x-seed-token": SEED_TOKEN,
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("disabled");
  });

  it("should return 401 when X-Seed-Token header is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/seed", {
      method: "POST",
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain("Unauthorized");
  });

  it("should return 401 when X-Seed-Token header is invalid", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/seed", {
      method: "POST",
      headers: {
        "x-seed-token": "wrong-token",
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain("Unauthorized");
  });

  it("should call runSeed with reset=false by default", async () => {
    mockRunSeed.mockResolvedValue({
      success: true,
      counts: {
        employees: 85,
        policies: 4,
        balances: 40,
        requests: 15,
        tasks: 20,
      },
    });

    const request = new NextRequest("http://localhost:3000/api/admin/seed", {
      method: "POST",
      headers: {
        "x-seed-token": SEED_TOKEN,
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.counts.employees).toBe(85);
    expect(mockRunSeed).toHaveBeenCalledWith({ reset: false });
  });

  it("should call runSeed with reset=true when requested", async () => {
    mockRunSeed.mockResolvedValue({
      success: true,
      counts: {
        employees: 85,
        policies: 4,
        balances: 40,
        requests: 15,
        tasks: 20,
      },
    });

    const request = new NextRequest("http://localhost:3000/api/admin/seed", {
      method: "POST",
      headers: {
        "x-seed-token": SEED_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ reset: true }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockRunSeed).toHaveBeenCalledWith({ reset: true });
  });

  it("should return 500 when seed fails", async () => {
    mockRunSeed.mockRejectedValue(new Error("Database connection failed"));

    const request = new NextRequest("http://localhost:3000/api/admin/seed", {
      method: "POST",
      headers: {
        "x-seed-token": SEED_TOKEN,
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.message).toContain("Database connection failed");
  });
});
