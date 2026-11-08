import { NextRequest, NextResponse } from "next/server";
import { runTimeOffAccruals } from "@/lib/time-off-accrual";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runTimeOffAccruals(new Date());
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Accrual failed:", error);
    return NextResponse.json(
      { error: "Accrual failed", message: error.message },
      { status: 500 }
    );
  }
}
