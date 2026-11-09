import { NextRequest, NextResponse } from "next/server";
import { runTimeOffAccruals } from "@/lib/time-off-accrual";
import { runTimeOffCarryover } from "@/lib/time-off-carryover";
import { isCronAuthorized } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!isCronAuthorized(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const asOf = new Date();
    const carryover = await runTimeOffCarryover(asOf);
    const accrual = await runTimeOffAccruals(asOf);
    return NextResponse.json({ success: true, carryover, accrual });
  } catch (error: any) {
    console.error("Accrual failed:", error);
    return NextResponse.json(
      { error: "Accrual failed", message: error.message },
      { status: 500 }
    );
  }
}
