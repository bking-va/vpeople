import { NextRequest } from "next/server";
import { bambooApplicantJobs } from "@/lib/bamboo-compat";

export async function GET(request: NextRequest) {
  return bambooApplicantJobs(request);
}
