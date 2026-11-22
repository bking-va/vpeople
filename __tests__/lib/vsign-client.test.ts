import { createVsignClient, isVsignConfigured, vsignCallbackUrl } from "@/lib/vsign/client";

const env = {
  VSIGN_BASE_URL: "https://vsign.example.test",
  VSIGN_CLIENT_ID: "vpeople",
  VSIGN_CLIENT_SECRET: "secret",
};

describe("vSign client", () => {
  test("is unconfigured without env", () => {
    expect(isVsignConfigured({})).toBe(false);
    expect(isVsignConfigured(env)).toBe(true);
  });

  test("callback URL is https only", () => {
    expect(vsignCallbackUrl({ AUTH_URL: "http://localhost:3000" })).toBeUndefined();
    expect(vsignCallbackUrl({ NEXT_PUBLIC_APP_URL: "https://vpeople.example" })).toBe(
      "https://vpeople.example/api/integrations/vsign/webhook"
    );
  });

  test("createDraft posts a draft and never calls send", async () => {
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).not.toContain("/send");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body));
      expect(body.fileBase64).toBeTruthy();
      expect(body.signers[0].email).toBe("ada@vendasta.com");
      return {
        ok: true,
        json: async () => ({
          envelope: {
            id: "env_1",
            status: "draft",
            pageCount: 1,
            signers: [{ id: "s1", name: "Ada", email: "ada@vendasta.com", status: "created" }],
          },
        }),
      } as Response;
    });

    const client = createVsignClient({ env, fetch: fetchMock as unknown as typeof fetch });
    const envelope = await client.createDraft("hr@vendasta.com", {
      title: "Offer letter",
      signerName: "Ada Target",
      signerEmail: "ada@vendasta.com",
      fileName: "offer.pdf",
      fileBytes: Buffer.from("%PDF-1.4"),
    });
    expect(envelope.id).toBe("env_1");
    expect(envelope.status).toBe("draft");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/integrations\/v1\/envelopes$/);
  });

  test("send is a separate explicit call", async () => {
    const fetchMock = jest.fn(async (url: string) => {
      expect(String(url)).toContain("/send");
      return {
        ok: true,
        json: async () => ({
          envelope: { id: "env_1", status: "sent", signers: [] },
        }),
      } as Response;
    });
    const client = createVsignClient({ env, fetch: fetchMock as unknown as typeof fetch });
    const envelope = await client.send("hr@vendasta.com", "env_1");
    expect(envelope.status).toBe("sent");
  });
});
