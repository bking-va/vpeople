import { NextResponse } from "next/server";
import { vendastaLegacySessionResponse } from "@/lib/vendasta-oidc";

/**
 * Admin Center "Session Url" is a legacy JWT POST, distinct from the OIDC
 * callback. vPeople does not accept those tokens or mint a session from them.
 */
function disabled() {
  const { status, body } = vendastaLegacySessionResponse();
  return NextResponse.json(body, { status });
}

export async function GET() {
  return disabled();
}

export async function POST() {
  return disabled();
}
