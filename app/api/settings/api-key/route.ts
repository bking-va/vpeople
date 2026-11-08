import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [employee] = await db
      .select({
        apiKeyHash: employees.apiKeyHash,
        apiKeyCreatedAt: employees.apiKeyCreatedAt,
        apiKeyLastUsedAt: employees.apiKeyLastUsedAt,
      })
      .from(employees)
      .where(eq(employees.email, session.user.email))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      hasApiKey: !!employee.apiKeyHash,
      createdAt: employee.apiKeyCreatedAt,
      lastUsedAt: employee.apiKeyLastUsedAt,
    });
  } catch (error: any) {
    console.error("Failed to check API key:", error);
    return NextResponse.json(
      { error: "Failed to check API key", message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, session.user.email))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    // Generate a new API key
    const apiKey = `vp_${crypto.randomBytes(32).toString("hex")}`;
    const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    // Update employee record
    await db
      .update(employees)
      .set({
        apiKeyHash,
        apiKeyCreatedAt: new Date(),
        apiKeyLastUsedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employee.id));

    return NextResponse.json({ apiKey });
  } catch (error: any) {
    console.error("Failed to generate API key:", error);
    return NextResponse.json(
      { error: "Failed to generate API key", message: error.message },
      { status: 500 }
    );
  }
}
