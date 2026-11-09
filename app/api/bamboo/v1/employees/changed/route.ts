import { NextRequest } from "next/server";
import { bambooEmployeesChanged } from "@/lib/bamboo-compat";

export async function GET(request: NextRequest) {
  return bambooEmployeesChanged(request);
}
