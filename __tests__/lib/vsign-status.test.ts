import {
  statusFromVsignEnvelope,
  statusFromWebhookEvent,
} from "@/lib/vsign/status";

describe("vSign status mapping", () => {
  test("maps envelope statuses used by vSign", () => {
    expect(statusFromVsignEnvelope("draft")).toBe("draft");
    expect(statusFromVsignEnvelope("sent")).toBe("sent");
    expect(statusFromVsignEnvelope("in_progress")).toBe("viewed");
    expect(statusFromVsignEnvelope("completed")).toBe("signed");
    expect(statusFromVsignEnvelope("declined")).toBe("declined");
    expect(statusFromVsignEnvelope("voided")).toBe("voided");
    expect(statusFromVsignEnvelope("unknown")).toBeNull();
  });

  test("maps webhook events", () => {
    expect(statusFromWebhookEvent("envelope.sent")).toBe("sent");
    expect(statusFromWebhookEvent("signer.viewed")).toBe("viewed");
    expect(statusFromWebhookEvent("envelope.completed")).toBe("signed");
    expect(statusFromWebhookEvent("envelope.declined")).toBe("declined");
    expect(statusFromWebhookEvent("envelope.voided")).toBe("voided");
  });
});
