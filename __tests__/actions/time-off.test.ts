/**
 * @jest-environment node
 */

import { approveTimeOffRequest, denyTimeOffRequest } from "@/app/actions/time-off";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

jest.mock("@/lib/auth");
jest.mock("@/lib/db");
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as any;

describe("Time Off Actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("approveTimeOffRequest", () => {
    it("should reject if user is not authenticated", async () => {
      mockAuth.mockResolvedValue(null);

      const result = await approveTimeOffRequest(1);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unauthorized");
    });

    it("should reject if user is not a manager or admin", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-1", role: "employee" },
      } as any);

      mockDb.select = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          leftJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([
                {
                  request: {
                    id: 1,
                    employeeId: 2,
                    status: "pending",
                    policyId: 1,
                    daysRequested: "5",
                  },
                  employee: { id: 2, managerId: 999 },
                },
              ]),
            }),
          }),
        }),
      });

      mockDb.select = jest.fn().mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          leftJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([
                {
                  request: {
                    id: 1,
                    employeeId: 2,
                    status: "pending",
                    policyId: 1,
                    daysRequested: "5",
                  },
                  employee: { id: 2, managerId: 999 },
                },
              ]),
            }),
          }),
        }),
      }).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([
              { id: 100, accessLevel: "employee" },
            ]),
          }),
        }),
      });

      const result = await approveTimeOffRequest(1);

      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
    });

    it("should approve request if user is the manager", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-1", role: "employee" },
      } as any);

      mockDb.select = jest.fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            leftJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([
                  {
                    request: {
                      id: 1,
                      employeeId: 2,
                      status: "pending",
                      policyId: 1,
                      daysRequested: "5",
                    },
                    employee: { id: 2, managerId: 100 },
                  },
                ]),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([
                { id: 100, accessLevel: "manager" },
              ]),
            }),
          }),
        });

      mockDb.update = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });

      mockDb.insert = jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      });

      mockDb.$with = jest.fn().mockReturnValue("SQL");

      const result = await approveTimeOffRequest(1);

      expect(result.success).toBe(true);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe("denyTimeOffRequest", () => {
    it("should reject if user is not authenticated", async () => {
      mockAuth.mockResolvedValue(null);

      const result = await denyTimeOffRequest(1);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unauthorized");
    });

    it("should reject if request is not pending", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-1", role: "admin" },
      } as any);

      mockDb.select = jest.fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            leftJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([
                  {
                    request: {
                      id: 1,
                      employeeId: 2,
                      status: "approved",
                      policyId: 1,
                      daysRequested: "5",
                    },
                    employee: { id: 2, managerId: 100 },
                  },
                ]),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([
                { id: 100, accessLevel: "full_admin" },
              ]),
            }),
          }),
        });

      const result = await denyTimeOffRequest(1);

      expect(result.success).toBe(false);
      expect(result.error).toContain("already been processed");
    });
  });
});
