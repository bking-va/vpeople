import { readFileSync } from "fs";
import { zipSync } from "fflate";
import {
  extractBoundedZipEntry,
  extractDocxText,
  extractResumeText,
  MAX_DOCX_ENTRIES,
  MAX_DOCX_ENTRY_BYTES,
  MAX_DOCX_PARSE_MS,
} from "@/lib/matching/resume-text";

function docxXml(paragraphs: string[]): Buffer {
  const body = paragraphs.map((p) => `<w:p><w:t>${p}</w:t></w:p>`).join("");
  return Buffer.from(`<?xml version="1.0"?><w:document>${body}</w:document>`);
}

function zipDocx(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files);
}

function patchCdUncompressedSize(zip: Uint8Array, size: number): Uint8Array {
  const copy = Buffer.from(zip);
  for (let i = 0; i < copy.length - 24; i++) {
    if (copy.readUInt32LE(i) === 0x02014b50) {
      copy.writeUInt32LE(size >>> 0, i + 24);
    }
  }
  return new Uint8Array(copy);
}

describe("bounded DOCX extraction", () => {
  test("extracts document.xml without unzipping sibling members", () => {
    const xml = docxXml(["Hello TypeScript"]);
    const decoy = new Uint8Array(200_000);
    const bytes = zipDocx({
      "word/document.xml": xml,
      "word/media/bomb.bin": decoy,
    });
    expect(extractDocxText(bytes)).toContain("Hello TypeScript");
    expect(
      extractBoundedZipEntry(bytes, "word/media/bomb.bin", {
        maxEntries: MAX_DOCX_ENTRIES,
        maxEntryBytes: MAX_DOCX_ENTRY_BYTES,
        maxMs: MAX_DOCX_PARSE_MS,
      })
    ).toEqual(decoy);
  });

  test("refuses archives with too many entries before inflating", () => {
    const files: Record<string, Uint8Array> = {
      "word/document.xml": docxXml(["Should not appear"]),
    };
    for (let i = 0; i < MAX_DOCX_ENTRIES; i++) {
      files[`pad/${i}.txt`] = new Uint8Array([1]);
    }
    const bytes = zipDocx(files);
    expect(extractDocxText(bytes)).toBe("");
    expect(() =>
      extractBoundedZipEntry(bytes, "word/document.xml", {
        maxEntries: MAX_DOCX_ENTRIES,
        maxEntryBytes: MAX_DOCX_ENTRY_BYTES,
        maxMs: MAX_DOCX_PARSE_MS,
      })
    ).toThrow(/entry count/);
  });

  test("aborts before allocating a claimed multi-gigabyte document.xml", () => {
    const bytes = patchCdUncompressedSize(
      zipDocx({ "word/document.xml": docxXml(["Hello"]) }),
      0x7f000000
    );
    const started = Date.now();
    expect(extractDocxText(bytes)).toBe("");
    expect(() =>
      extractBoundedZipEntry(bytes, "word/document.xml", {
        maxEntries: MAX_DOCX_ENTRIES,
        maxEntryBytes: MAX_DOCX_ENTRY_BYTES,
        maxMs: MAX_DOCX_PARSE_MS,
      })
    ).toThrow(/decompressed size/);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  test("keeps DOCX paragraphs so labeled protected attributes can be stripped", async () => {
    const bytes = zipDocx({
      "word/document.xml": docxXml([
        "Jane Doe",
        "Gender: Female",
        "TypeScript and Postgres",
      ]),
    });
    const text = extractDocxText(bytes);
    expect(text).toMatch(/Jane Doe/);
    expect(text).toMatch(/\n/);
    const stripped = await extractResumeText(
      bytes,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "resume.docx"
    );
    expect(stripped).toContain("TypeScript");
    expect(stripped).not.toMatch(/Female/i);
    expect(stripped).not.toMatch(/Gender/i);
  });

  test("does not call whole-archive unzipSync", () => {
    const src = readFileSync("lib/matching/resume-text.ts", "utf8");
    expect(src).not.toMatch(/unzipSync/);
    expect(src).toMatch(/extractBoundedZipEntry/);
  });

  test("accepts Node Buffer PDF bytes", async () => {
    const pdf = Buffer.from("%PDF-1.1\n(BT (Ada Lovelace TypeScript) Tj) ET", "latin1");
    const text = await extractResumeText(pdf, "application/pdf", "cv.pdf");
    expect(text).toContain("TypeScript");
  });
});
