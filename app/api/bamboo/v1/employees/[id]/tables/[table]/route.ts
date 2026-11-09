import { NextRequest, NextResponse } from "next/server";
import { bambooEmployeeTable } from "@/lib/bamboo-compat";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; table: string }> }
) {
  const { id, table } = await params;
  const employeeId = parseInt(id, 10);
  if (Number.isNaN(employeeId)) {
    return NextResponse.json({ error: "Invalid employee id" }, { status: 400 });
  }
  return bambooEmployeeTable(request, employeeId, table);
}
