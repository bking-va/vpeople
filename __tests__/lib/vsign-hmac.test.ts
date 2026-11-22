import { verifyVsignWebhookSignature, vsignWebhookSignature } from "@/lib/vsign/hmac";

describe("vSign webhook HMAC", () => {
  const secret = "test-webhook-secret";
  const body = JSON.stringify({
    event: "envelope.completed",
    envelopeId: "env_1",
    status: "completed",
  });

  test("accepts a matching sha256 header", () => {
    const header = vsignWebhookSignature(body, secret);
    expect(header.startsWith("sha256=")).toBe(true);
    expect(verifyVsignWebhookSignature(body, header, secret)).toBe(true);
  });

  test("rejects a wrong secret, missing header, or truncated hex", () => {
    const header = vsignWebhookSignature(body, secret);
    expect(verifyVsignWebhookSignature(body, header, "other")).toBe(false);
    expect(verifyVsignWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyVsignWebhookSignature(body, "sha256=abcd", secret)).toBe(false);
    expect(verifyVsignWebhookSignature(body, header, "")).toBe(false);
  });
});
