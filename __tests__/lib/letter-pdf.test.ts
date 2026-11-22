import { letterBodyToPdf, wrapLetterLines } from "@/lib/letter-pdf";

describe("letter PDF", () => {
  test("wraps long lines without inventing legal copy", () => {
    const lines = wrapLetterLines("Dear Ada,\n\nPlease sign this letter.\n");
    expect(lines.join("\n")).toContain("Dear Ada");
    expect(lines.join("\n")).toContain("Please sign this letter.");
    expect(lines.join("\n")).not.toMatch(/India|GST|Shops and Establishments/i);
  });

  test("emits a PDF that contains the issued body", () => {
    const pdf = letterBodyToPdf("Offer letter", "Dear Ada Lovelace,\nPlease sign.");
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("Dear Ada Lovelace");
    expect(text).toContain("%%EOF");
  });
});
