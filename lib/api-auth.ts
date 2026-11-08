import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { employees, accessLevels } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export interface ApiKeyAuth {
  employeeId: number;
  email: string;
  permissions: {
    canViewCompensation: boolean;
    canEditCompensation: boolean;
    canViewSensitivePersonalInfo: boolean;
    canEditSensitivePersonalInfo: boolean;
    canViewBankInfo: boolean;
    canEditBankInfo: boolean;
    canManageUsers: boolean;
    canManageSettings: boolean;
    canApproveTimeOff: boolean;
    canApproveCompensationChanges: boolean;
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

    // Look up employee by hashed API key and join with access levels
    const [employee] = await db
      .select({
        id: employees.id,
        email: employees.email,
        apiKeyHash: employees.apiKeyHash,
        accessLevel: employees.accessLevel,
        permissions: accessLevels,
      })
      .from(employees)
      .leftJoin(accessLevels, eq(employees.accessLevel, accessLevels.code))
      .where(eq(employees.apiKeyHash, hashedKey))
      .limit(1);

    if (!employee) {
      return null;
    }

    // Return full permissions from access level
    const perms = employee.permissions || {
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
    };

    return {
      employeeId: employee.id,
      email: employee.email,
      permissions: {
        canViewCompensation: perms.canViewCompensation,
        canEditCompensation: perms.canEditCompensation,
        canViewSensitivePersonalInfo: perms.canViewSensitivePersonalInfo,
        canEditSensitivePersonalInfo: perms.canEditSensitivePersonalInfo,
        canViewBankInfo: perms.canViewBankInfo,
        canEditBankInfo: perms.canEditBankInfo,
        canManageUsers: perms.canManageUsers,
        canManageSettings: perms.canManageSettings,
        canApproveTimeOff: perms.canApproveTimeOff,
        canApproveCompensationChanges: perms.canApproveCompensationChanges,
      },
    };
  } catch (error) {
    console.error("API key authentication error:", error);
    return null;
  }
}

/**
 * Filter employee object to remove fields the API key owner cannot view
 */
export function filterEmployeeFields(employee: any, permissions: ApiKeyAuth["permissions"]) {
  const filtered: any = { ...employee };

  // Remove compensation if not permitted
  if (!permissions.canViewCompensation) {
    delete filtered.salary;
    delete filtered.hourlyRate;
    delete filtered.payRate;
    delete filtered.currency;
    delete filtered.bonusAmount;
    delete filtered.bonusDate;
    delete filtered.equityShares;
    delete filtered.equityValue;
  }

  // Remove SIN/SSN if not permitted
  if (!permissions.canViewSensitivePersonalInfo) {
    delete filtered.sin;
    delete filtered.ssn;
    delete filtered.passportNumber;
    delete filtered.nationalId;
  }

  // Remove bank info if not permitted
  if (!permissions.canViewBankInfo) {
    delete filtered.bankName;
    delete filtered.bankAccountNumber;
    delete filtered.bankRoutingNumber;
    delete filtered.bankSwiftCode;
  }

  return filtered;
}
