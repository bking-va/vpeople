import { NextRequest } from "next/server";
import { bambooCompensationTable } from "@/lib/bamboo-compat";

export async function GET(request: NextRequest) {
  return bambooCompensationTable(request);
}
