import { NextRequest } from "next/server";
import { bambooFiles } from "@/lib/bamboo-compat";

export async function GET(request: NextRequest) {
  return bambooFiles(request);
}
