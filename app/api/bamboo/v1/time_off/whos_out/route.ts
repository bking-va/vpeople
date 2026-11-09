import { NextRequest } from "next/server";
import { bambooWhosOut } from "@/lib/bamboo-compat";

export async function GET(request: NextRequest) {
  return bambooWhosOut(request);
}
