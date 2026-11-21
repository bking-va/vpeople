import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/authz";
import { refreshFxRates } from "@/lib/fx-rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!isCronAuthorized(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshFxRates();
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "FX refresh failed";
    console.error("FX rate refresh failed:", message);
    return NextResponse.json({ error: "FX refresh failed" }, { status: 500 });
  }
}
