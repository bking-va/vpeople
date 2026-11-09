import { NextRequest } from "next/server";
import { bambooApplicantApplications } from "@/lib/bamboo-compat";

export async function GET(request: NextRequest) {
  return bambooApplicantApplications(request);
}
