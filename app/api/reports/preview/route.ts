import { NextRequest, NextResponse } from "next/server";
import { parseReportFilters, runCustomEmployeeReport } from "@/lib/reports/custom";
import { getReportViewer } from "@/lib/reports/viewer";

export async function GET(request: NextRequest) {
  const { session, viewer } = await getReportViewer();
  if (!session?.user || !viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fields = searchParams.get("fields")?.split(",").filter(Boolean) || [];
  const groupBy = searchParams.get("groupBy") || "none";
  const filters = parseReportFilters(searchParams);

  try {
    const result = await runCustomEmployeeReport({
      fields,
      groupBy,
      filters,
      viewer,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Preview failed:", error);
    return NextResponse.json(
      { error: "Preview failed", message: error.message },
      { status: 500 }
    );
  }
}
