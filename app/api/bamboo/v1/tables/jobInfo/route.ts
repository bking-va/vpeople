import { NextRequest } from "next/server";
import { bambooJobInfoTable } from "@/lib/bamboo-compat";

export async function GET(request: NextRequest) {
  return bambooJobInfoTable(request);
}
