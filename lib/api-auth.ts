import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export interface ApiKeyAuth {
  employeeId: number;
  email: string;
  permissions: {
    canViewCompensation: boolean;
    canEditCompensation: boolean;
    canManageSettings: boolean;
    canApproveTimeOff: boolean;
  };
}

/**
 * Authenticate API requests using Basic Auth with API keys
 * Compatible with BambooHR API authentication
 */
export async function authenticateApiKey(
  request: NextRequest
): Promise<ApiKeyAuth | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return null;
  }

  try {
    // Basic auth format: "Basic base64(apiKey:x)"
    const base64Credentials = authHeader.split(" ")[1];
    const credentials = Buffer.from(base64Credentials, "base64").toString();
    const [apiKey] = credentials.split(":");

    if (!apiKey) {
      return null;
    }

    // Hash the provided API key
    const hashedKey = crypto.createHash("sha256").update(apiKey).digest("hex");

    // Look up employee by hashed API key
    const [employee] = await db
      .select({
        id: employees.id,
        email: employees.email,
        apiKeyHash: employees.apiKeyHash,
        accessLevel: employees.accessLevel,
      })
      .from(employees)
      .where(eq(employees.apiKeyHash, hashedKey))
      .limit(1);

    if (!employee) {
      return null;
    }

    // Get permissions from access level
    // For now, simplified - in production, join with access_levels table
    const isAdmin = employee.accessLevel === "full_admin";

    return {
      employeeId: employee.id,
      email: employee.email,
      permissions: {
        canViewCompensation: isAdmin,
        canEditCompensation: isAdmin,
        canManageSettings: isAdmin,
        canApproveTimeOff: isAdmin,
      },
    };
  } catch (error) {
    console.error("API key authentication error:", error);
    return null;
  }
}
