import { NextRequest } from "next/server";
import { bambooMetaFields } from "@/lib/bamboo-compat";

export async function GET(request: NextRequest) {
  return bambooMetaFields(request);
}
