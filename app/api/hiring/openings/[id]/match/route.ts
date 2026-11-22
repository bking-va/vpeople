import { NextRequest } from "next/server";
import { POST as matchPost } from "@/app/api/hiring/match/route";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const headers = new Headers();
  headers.set("content-type", "application/json");
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const forwarded = new NextRequest(new URL("/api/hiring/match", request.url), {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...(typeof body === "object" && body ? body : {}),
      jobOpeningId: Number(id),
    }),
  });
  return matchPost(forwarded);
}
