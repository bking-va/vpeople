import { NextRequest } from "next/server";
import { bambooEmploymentStatusTable } from "@/lib/bamboo-compat";

export async function GET(request: NextRequest) {
  return bambooEmploymentStatusTable(request);
}
