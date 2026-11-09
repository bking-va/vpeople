import { NextRequest } from "next/server";
import { bambooMetaLists } from "@/lib/bamboo-compat";

export async function GET(request: NextRequest) {
  return bambooMetaLists(request);
}
