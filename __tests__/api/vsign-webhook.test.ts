import { NextRequest } from "next/server";
import { vsignWebhookSignature } from "@/lib/vsign/hmac";

jest.mock("@/lib/signature-requests", () => ({
  applyVsignWebhook: jest.fn(),
}));

import { applyVsignWebhook } from "@/lib/signature-requests";
import { POST } from "@/app/api/integrations/vsign/webhook/route";

const mockedApply = applyVsignWebhook as jest.MockedFunction<typeof applyVsignWebhook>;

describe("vSign webhook route", () => {
  const secret = "whsec_test";
  const payload = {
    event: "envelope.completed",
    envelopeId: "env_1",
    status: "completed",
    signers: [],
  };

  beforeEach(() => {
    process.env.VSIGN_WEBHOOK_SECRET = secret;
    mockedApply.mockReset();
    mockedApply.mockResolvedValue({ handled: true, requestId: 1 });
  });

  test("rejects a missing or invalid signature", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/integrations/vsign/webhook", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
    expect(res.status).toBe(401);
    expect(mockedApply).not.toHaveBeenCalled();
  });

  test("fails closed when the webhook secret is unset", async () => {
    delete process.env.VSIGN_WEBHOOK_SECRET;
    const res = await POST(
      new NextRequest("http://localhost/api/integrations/vsign/webhook", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
    expect(res.status).toBe(503);
    expect(mockedApply).not.toHaveBeenCalled();
  });

  test("applies a valid payload", async () => {
    const raw = JSON.stringify(payload);
    const res = await POST(
      new NextRequest("http://localhost/api/integrations/vsign/webhook", {
        method: "POST",
        headers: { "x-vsign-signature": vsignWebhookSignature(raw, secret) },
        body: raw,
      })
    );
    expect(res.status).toBe(200);
    expect(mockedApply).toHaveBeenCalledWith(payload);
  });
});
