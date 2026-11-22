/** Minimal one-or-more-page PDF from issued letter text. No extra dependency. */

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 72;
const FONT_SIZE = 11;
const LINE_HEIGHT = 14;
const CHARS_PER_LINE = 82;

export class LetterPdfEncodingError extends Error {
  constructor() {
    super(
      "This letter contains characters that cannot go into the generated PDF. Upload a PDF of the letter and send that instead."
    );
    this.name = "LetterPdfEncodingError";
  }
}

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const PUNCTUATION_FOLDS: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
};

function foldForWinAnsi(ch: string): string {
  if (Object.prototype.hasOwnProperty.call(PUNCTUATION_FOLDS, ch)) {
    return PUNCTUATION_FOLDS[ch];
  }
  return ch;
}

function toWinAnsi(text: string): string {
  return Array.from(text)
    .map((ch) => {
      const folded = foldForWinAnsi(ch);
      return Array.from(folded)
        .map((part) => {
          const code = part.charCodeAt(0);
          if (part === "\t") return "    ";
          if (code === 10 || code === 13) return part;
          if (code >= 32 && code <= 126) return part;
          if (code >= 160 && code <= 255) return part;
          throw new LetterPdfEncodingError();
        })
        .join("");
    })
    .join("");
}

export function wrapLetterLines(body: string): string[] {
  const lines: string[] = [];
  const normalized = toWinAnsi(body.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
  for (const paragraph of normalized.split("\n")) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    let remaining = paragraph;
    while (remaining.length > CHARS_PER_LINE) {
      let cut = remaining.lastIndexOf(" ", CHARS_PER_LINE);
      if (cut < 40) cut = CHARS_PER_LINE;
      lines.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut).trimStart();
    }
    lines.push(remaining);
  }
  return lines.length ? lines : [""];
}

function pageContent(lines: string[]): string {
  const startY = PAGE_HEIGHT - MARGIN;
  const ops = [
    "BT",
    `/F1 ${FONT_SIZE} Tf`,
    `${LINE_HEIGHT} TL`,
    `${MARGIN} ${startY} Td`,
  ];
  for (const line of lines) {
    ops.push(`(${pdfEscape(line)}) Tj`);
    ops.push("T*");
  }
  ops.push("ET");
  return ops.join("\n");
}

export function letterBodyToPdf(title: string, body: string): Buffer {
  const heading = toWinAnsi(title.trim() || "Letter");
  const lines = [heading, "", ...wrapLetterLines(body)];
  const linesPerPage = Math.max(1, Math.floor((PAGE_HEIGHT - MARGIN * 2) / LINE_HEIGHT));
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  pages.push(["Please sign and date below."]);

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");

  const pageIds = pages.map((_, i) => 3 + i);
  const contentIds = pages.map((_, i) => 3 + pages.length + i);
  const fontId = 3 + pages.length * 2;
  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`
  );

  pages.forEach((_, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`
    );
  });

  pages.forEach((pageLines) => {
    const stream = pageContent(pageLines);
    objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  });

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let out = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n`;
  out += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
