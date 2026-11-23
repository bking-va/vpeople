import { BambooHrClient, safeDecodeFilename } from "@/lib/bamboo-sync/client";

describe("safeDecodeFilename", () => {
  test("decodes percent-encoded filenames", () => {
    expect(safeDecodeFilename("Hello%20World.pdf")).toBe("Hello World.pdf");
    expect(safeDecodeFilename("100%25%20Bonus.pdf")).toBe("100% Bonus.pdf");
    expect(safeDecodeFilename("caf%C3%A9.pdf")).toBe("café.pdf");
  });

  test("keeps literal percent filenames instead of throwing", () => {
    expect(safeDecodeFilename("100% Bonus.pdf")).toBe("100% Bonus.pdf");
    expect(safeDecodeFilename("Q1 100% Complete.xlsx")).toBe("Q1 100% Complete.xlsx");
    expect(safeDecodeFilename("file%ZZ.pdf")).toBe("file%ZZ.pdf");
    expect(safeDecodeFilename("%")).toBe("%");
  });
});

describe("Bamboo file download Content-Disposition", () => {
  test("accepts RFC 5987 encoded filenames and literal-percent names", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/files/1")) {
        return new Response(Buffer.from("encoded"), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": "attachment; filename*=UTF-8''100%25%20Bonus.pdf",
          },
        });
      }
      if (url.endsWith("/files/2")) {
        return new Response(Buffer.from("literal"), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="100% Bonus.pdf"',
          },
        });
      }
      return new Response("not found", { status: 404 });
    };

    const client = new BambooHrClient({
      apiKey: "test-key",
      subdomain: "vendasta",
      fetch: fetchImpl,
    });

    await expect(client.fetchFile("1")).resolves.toMatchObject({
      filename: "100% Bonus.pdf",
    });
    await expect(client.fetchFile("2")).resolves.toMatchObject({
      filename: "100% Bonus.pdf",
    });
  });
});
