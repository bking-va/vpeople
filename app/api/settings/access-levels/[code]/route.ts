import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessLevels } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "full_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await request.json();
    const { code } = await params;

    const [updated] = await db
      .update(accessLevels)
      .set({
        canViewCompensation: data.canViewCompensation,
        canEditCompensation: data.canEditCompensation,
        canViewSensitivePersonalInfo: data.canViewSensitivePersonalInfo,
        canEditSensitivePersonalInfo: data.canEditSensitivePersonalInfo,
        canViewBankInfo: data.canViewBankInfo,
        canEditBankInfo: data.canEditBankInfo,
        canManageUsers: data.canManageUsers,
        canManageSettings: data.canManageSettings,
        canApproveTimeOff: data.canApproveTimeOff,
        canApproveCompensationChanges: data.canApproveCompensationChanges,
        updatedAt: new Date(),
      })
      .where(eq(accessLevels.code, code))
      .returning();

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Failed to update access level:", error);
    return NextResponse.json(
      { error: "Failed to update access level", message: error.message },
      { status: 500 }
    );
  }
}
