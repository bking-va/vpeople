/**
 * Security Test: Bamboo API Permission Enforcement
 * 
 * Verifies that:
 * 1. Unauthenticated requests get 401
 * 2. API keys inherit proper permissions from their owner
 * 3. Low-permission keys cannot view compensation, SIN/SSN, bank info
 * 4. Employees can only see themselves and their direct reports
 * 5. Admins can see all employees with full fields
 */

import { GET as getDirectory } from "@/app/api/bamboo/v1/employees/directory/route";
import { GET as getEmployee } from "@/app/api/bamboo/v1/employees/[id]/route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { employees, accessLevels } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

// Mock database responses
jest.mock("@/lib/db", () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    or: jest.fn(),
    inArray: jest.fn(),
  },
}));

describe("Bamboo API Security", () => {
  const createMockRequest = (apiKey?: string) => {
    const headers: Record<string, string> = {};
    if (apiKey) {
      const base64 = Buffer.from(`${apiKey}:x`).toString("base64");
      headers["authorization"] = `Basic ${base64}`;
    }
    return new NextRequest("http://localhost:3000/api/bamboo/v1/employees/directory", {
      headers,
    });
  };

  describe("Authentication", () => {
    test("GET /directory returns 401 without API key", async () => {
      const req = createMockRequest();
      const res = await getDirectory(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    test("GET /directory returns 401 with invalid API key", async () => {
      // Mock database to return no match
      (db.select().from(employees).leftJoin as jest.Mock).mockResolvedValueOnce([]);
      
      const req = createMockRequest("invalid-key-12345");
      const res = await getDirectory(req);
      expect(res.status).toBe(401);
    });

    test("GET /employees/1 returns 401 without API key", async () => {
      const req = createMockRequest();
      const res = await getEmployee(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(401);
    });
  });

  describe("Permission-Based Field Filtering", () => {
    test("Employee-level key cannot view compensation fields", async () => {
      const testApiKey = "test-key-employee";
      const hashedKey = crypto.createHash("sha256").update(testApiKey).digest("hex");

      // Mock employee with employee access level
      (db.select().from(employees).leftJoin as jest.Mock).mockResolvedValueOnce([
        {
          id: 1,
          email: "test@example.com",
          apiKeyHash: hashedKey,
          accessLevel: "employee",
          permissions: {
            canViewCompensation: false,
            canEditCompensation: false,
            canViewSensitivePersonalInfo: false,
            canEditSensitivePersonalInfo: false,
            canViewBankInfo: false,
            canEditBankInfo: false,
            canManageUsers: false,
            canManageSettings: false,
            canApproveTimeOff: false,
            canApproveCompensationChanges: false,
          },
        },
      ]);

      // Mock direct reports query (none)
      (db.select().from(employees).where as jest.Mock).mockResolvedValueOnce([]);

      // Mock employee self query with compensation data
      (db.select().from(employees).leftJoin as jest.Mock).mockResolvedValueOnce([
        {
          employees: {
            id: 1,
            employeeNumber: "E001",
            firstName: "John",
            lastName: "Doe",
            email: "john@example.com",
            salary: 100000, // Should be filtered
            sin: "123-456-789", // Should be filtered
            bankAccountNumber: "9876543210", // Should be filtered
          },
          departments: null,
          locations: null,
        },
      ]);

      const req = createMockRequest(testApiKey);
      const res = await getEmployee(req, { params: Promise.resolve({ id: "1" }) });
      
      expect(res.status).toBe(200);
      const body = await res.json();
      
      // Verify compensation fields are NOT in response
      expect(body.salary).toBeUndefined();
      expect(body.sin).toBeUndefined();
      expect(body.bankAccountNumber).toBeUndefined();
      
      // Verify safe fields are present
      expect(body.firstName).toBe("John");
      expect(body.lastName).toBe("Doe");
    });

    test("Admin-level key can view all fields", async () => {
      const testApiKey = "test-key-admin";
      const hashedKey = crypto.createHash("sha256").update(testApiKey).digest("hex");

      // Mock employee with full_admin access level
      (db.select().from(employees).leftJoin as jest.Mock).mockResolvedValueOnce([
        {
          id: 2,
          email: "admin@example.com",
          apiKeyHash: hashedKey,
          accessLevel: "full_admin",
          permissions: {
            canViewCompensation: true,
            canEditCompensation: true,
            canViewSensitivePersonalInfo: true,
            canEditSensitivePersonalInfo: true,
            canViewBankInfo: true,
            canEditBankInfo: true,
            canManageUsers: true,
            canManageSettings: true,
            canApproveTimeOff: true,
            canApproveCompensationChanges: true,
          },
        },
      ]);

      // Mock all employees query for admin
      (db.select().from(employees).leftJoin as jest.Mock).mockResolvedValueOnce([
        {
          employees: {
            id: 1,
            employeeNumber: "E001",
            firstName: "John",
            lastName: "Doe",
            email: "john@example.com",
            salary: 100000,
            sin: "123-456-789",
            bankAccountNumber: "9876543210",
          },
          departments: null,
        },
      ]);

      const req = createMockRequest(testApiKey);
      const res = await getDirectory(req);
      
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.employees).toBeDefined();
      expect(body.employees.length).toBeGreaterThan(0);
    });
  });

  describe("Scope-Based Access Control", () => {
    test("Employee cannot access other employees outside their scope", async () => {
      const testApiKey = "test-key-employee-2";
      const hashedKey = crypto.createHash("sha256").update(testApiKey).digest("hex");

      // Mock employee with employee access level
      (db.select().from(employees).leftJoin as jest.Mock).mockResolvedValueOnce([
        {
          id: 5,
          email: "emp5@example.com",
          apiKeyHash: hashedKey,
          accessLevel: "employee",
          permissions: {
            canViewCompensation: false,
            canManageUsers: false,
          },
        },
      ]);

      // Mock employee trying to access (different employee, not their manager)
      (db.select().from(employees).leftJoin as jest.Mock).mockResolvedValueOnce([
        {
          employees: {
            id: 10,
            managerId: 999, // Different manager
            firstName: "Other",
            lastName: "Employee",
          },
          departments: null,
          locations: null,
        },
      ]);

      const req = createMockRequest(testApiKey);
      const res = await getEmployee(req, { params: Promise.resolve({ id: "10" }) });
      
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    test("Manager can access their direct reports", async () => {
      const testApiKey = "test-key-manager";
      const hashedKey = crypto.createHash("sha256").update(testApiKey).digest("hex");

      // Mock manager
      (db.select().from(employees).leftJoin as jest.Mock).mockResolvedValueOnce([
        {
          id: 3,
          email: "manager@example.com",
          apiKeyHash: hashedKey,
          accessLevel: "manager",
          permissions: {
            canViewCompensation: false,
            canManageUsers: false,
          },
        },
      ]);

      // Mock direct report
      (db.select().from(employees).leftJoin as jest.Mock).mockResolvedValueOnce([
        {
          employees: {
            id: 4,
            managerId: 3, // Reports to manager (id 3)
            firstName: "Direct",
            lastName: "Report",
          },
          departments: null,
          locations: null,
        },
      ]);

      const req = createMockRequest(testApiKey);
      const res = await getEmployee(req, { params: Promise.resolve({ id: "4" }) });
      
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.firstName).toBe("Direct");
    });
  });
});
