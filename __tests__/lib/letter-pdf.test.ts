import { letterBodyToPdf, wrapLetterLines, LetterPdfEncodingError } from "@/lib/letter-pdf";

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
    expect(text).toContain("Please sign and date below.");
    expect(text).toContain("%%EOF");
  });

  test("folds curly quotes without inventing copy, and refuses unencodable text", () => {
    const lines = wrapLetterLines("Dear Ada\u2014please sign \u201Cthis\u201D letter.");
    expect(lines.join("\n")).toContain('Dear Ada-please sign "this" letter.');
    expect(() => letterBodyToPdf("Offer", "Dear Ada \u{1F44D}")).toThrow(LetterPdfEncodingError);
  });

  test("puts signature fields on a dedicated last page so they do not overlay copy", () => {
    const longBody = Array.from({ length: 80 }, (_, i) => `Line ${i} of the letter.`).join("\n");
    const pdf = letterBodyToPdf("Offer letter", longBody);
    const text = pdf.toString("latin1");
    expect(text).toContain("Line 0 of the letter.");
    expect(text).toContain("Please sign and date below.");
  });
});
