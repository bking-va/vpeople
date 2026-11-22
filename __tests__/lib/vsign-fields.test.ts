import { defaultSignatureFields } from "@/lib/vsign/fields";

describe("vSign default fields", () => {
  test("places signature and date on the last page", () => {
    const fields = defaultSignatureFields({ signerId: "s1", pageCount: 3 });
    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({
      signerId: "s1",
      type: "signature",
      page: 3,
      required: true,
    });
    expect(fields[1]).toMatchObject({
      signerId: "s1",
      type: "date",
      page: 3,
      required: true,
    });
  });

  test("treats a missing page count as page 1", () => {
    const fields = defaultSignatureFields({ signerId: "s1", pageCount: 0 });
    expect(fields[0].page).toBe(1);
  });
});
