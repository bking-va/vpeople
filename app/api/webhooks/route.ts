import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { webhooks, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [employee] = await db
    .select({ accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.email, session.user.email))
    .limit(1);

  if (!employee || employee.accessLevel !== "full_admin") {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  try {
    const allWebhooks = await db.select().from(webhooks);
    return NextResponse.json({ webhooks: allWebhooks });
  } catch (error: any) {
    console.error("Failed to fetch webhooks:", error);
    return NextResponse.json(
      { error: "Failed to fetch webhooks", message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [employee] = await db
    .select({ accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.email, session.user.email))
    .limit(1);

  if (!employee || employee.accessLevel !== "full_admin") {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  try {
    const data = await request.json();

    // Validate URL
    try {
      new URL(data.url);
    } catch {
      return NextResponse.json(
        { error: "Invalid webhook URL" },
        { status: 400 }
      );
    }

    // Generate secret
    const secret = crypto.randomBytes(32).toString("hex");

    const [webhook] = await db
      .insert(webhooks)
      .values({
        name: data.name,
        url: data.url,
        events: JSON.stringify(data.events || []),
        secret,
        isActive: data.isActive !== false,
      })
      .returning();

    return NextResponse.json({ webhook });
  } catch (error: any) {
    console.error("Failed to create webhook:", error);
    return NextResponse.json(
      { error: "Failed to create webhook", message: error.message },
      { status: 500 }
    );
  }
}
