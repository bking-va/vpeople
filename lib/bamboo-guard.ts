import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, type ApiKeyAuth } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";

const BAMBOO_RATE_LIMIT = { maxAttempts: 100, windowMs: 60_000 };

export async function authenticateBambooRequest(
  request: NextRequest,
  endpoint: string
): Promise<{ auth: ApiKeyAuth } | { response: NextResponse }> {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return {
      response: NextResponse.json(
        { error: "Unauthorized", message: "Valid API key required" },
        { status: 401 }
      ),
    };
  }

  const identifier = `api-key:${auth.employeeId}`;
  const limit = await checkRateLimit(identifier, endpoint, BAMBOO_RATE_LIMIT);
  if (!limit.success) {
    return {
      response: NextResponse.json(
        { error: "Too Many Requests", message: "API rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": Math.max(
              1,
              Math.ceil((limit.reset.getTime() - Date.now()) / 1000)
            ).toString(),
          },
        }
      ),
    };
  }

  return { auth };
}

export function bambooError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
