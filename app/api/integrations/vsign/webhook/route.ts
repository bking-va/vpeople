import { NextRequest, NextResponse } from "next/server";
import { verifyVsignWebhookSignature } from "@/lib/vsign/hmac";
import { applyVsignWebhook, type VsignWebhookPayload } from "@/lib/signature-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.VSIGN_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "webhook_unavailable" }, { status: 503 });
  }

  const raw = await request.text();
  const header =
    request.headers.get("x-vsign-signature") ?? request.headers.get("X-VSign-Signature");
  if (!verifyVsignWebhookSignature(raw, header, secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: VsignWebhookPayload;
  try {
    payload = JSON.parse(raw) as VsignWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await applyVsignWebhook(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("vSign webhook failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "webhook_failed" }, { status: 500 });
  }
}
