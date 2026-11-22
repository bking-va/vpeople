import { createHash } from "crypto";
import { inflateSync } from "fflate";
import { stripProtectedText } from "./privacy";

export const MAX_RESUME_BYTES = 8 * 1024 * 1024;
/** Typical résumé DOCX has ~10–20 members; extra media files still fit. */
export const MAX_DOCX_ENTRIES = 128;
/** Only `word/document.xml` is inflated, and never beyond this size. */
export const MAX_DOCX_ENTRY_BYTES = 1 * 1024 * 1024;
export const MAX_DOCX_PARSE_MS = 500;
export const MAX_PDF_PAGES = 30;
export const MAX_PDF_PARSE_MS = 2_000;
export const DOCX_DOCUMENT_ENTRY = "word/document.xml";

const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export function hashResumeBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readStreamWithLimit(
  stream: ReadableStream<Uint8Array>,
  maxBytes = MAX_RESUME_BYTES
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      reader.cancel().catch(() => undefined);
      throw new Error("Résumé file exceeds the 8MB matching limit");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export async function extractResumeText(
  bytes: Uint8Array,
  contentType?: string | null,
  filename?: string | null
): Promise<string> {
  const type = (contentType || "").toLowerCase();
  const name = (filename || "").toLowerCase();
  if (type.includes("text/plain") || name.endsWith(".txt")) {
    return stripProtectedText(Buffer.from(bytes).toString("utf8"));
  }
  if (type.includes("pdf") || name.endsWith(".pdf") || isPdf(bytes)) {
    return stripProtectedText(await extractPdfText(bytes));
  }
  if (
    type.includes("wordprocessingml") ||
    type.includes("officedocument") ||
    name.endsWith(".docx") ||
    isZip(bytes)
  ) {
    return stripProtectedText(extractDocxText(bytes));
  }
  return stripProtectedText(Buffer.from(bytes).toString("utf8"));
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function toPlainUint8Array(bytes: Uint8Array): Uint8Array {
  // unpdf/pdf.js reject Node Buffer (a Uint8Array subclass). Copy to a plain view.
  return new Uint8Array(bytes);
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const data = toPlainUint8Array(bytes);
    const pdf = await withTimeout(
      getDocumentProxy(data, {
        maxImageSize: 16_777_216,
        stopAtErrors: true,
        verbosity: 0,
      }),
      MAX_PDF_PARSE_MS,
      "PDF parse timeout"
    );
    try {
      if (pdf.numPages > MAX_PDF_PAGES) {
        return extractPdfStringsFallback(bytes);
      }
      const result = await withTimeout(
        extractText(pdf, { mergePages: true }),
        MAX_PDF_PARSE_MS,
        "PDF extract timeout"
      );
      const text = Array.isArray(result.text) ? result.text.join("\n") : String(result.text || "");
      return text;
    } finally {
      await pdf.loadingTask.destroy().catch(() => undefined);
    }
  } catch {
    return extractPdfStringsFallback(bytes);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Best-effort for uncompressed PDF literal strings. Used if unpdf is unavailable. */
export function extractPdfStringsFallback(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const chunks: string[] = [];
  const re = /\((?:\\.|[^\\)]){2,200}\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const inner = match[0].slice(1, -1);
    const decoded = inner
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\t/g, " ")
      .replace(/\\([()\\])/g, "$1");
    if (/[A-Za-z]{2}/.test(decoded)) chunks.push(decoded);
    if (chunks.length > 4000) break;
  }
  return chunks.join(" ");
}

export function extractDocxText(bytes: Uint8Array): string {
  try {
    const xmlBytes = extractBoundedZipEntry(bytes, DOCX_DOCUMENT_ENTRY, {
      maxEntries: MAX_DOCX_ENTRIES,
      maxEntryBytes: MAX_DOCX_ENTRY_BYTES,
      maxMs: MAX_DOCX_PARSE_MS,
    });
    if (!xmlBytes) return "";
    return xmlToResumeText(Buffer.from(xmlBytes).toString("utf8"));
  } catch {
    return "";
  }
}

/**
 * Inflate a single named ZIP member with hard entry-count, uncompressed-size,
 * and wall-clock limits. Other members are never inflated. Zip64 is refused.
 */
export function extractBoundedZipEntry(
  data: Uint8Array,
  entryName: string,
  limits: { maxEntries: number; maxEntryBytes: number; maxMs: number }
): Uint8Array | null {
  const started = Date.now();
  const eocd = findEocd(data);
  if (eocd >= 20 && u32(data, eocd - 20) === ZIP64_LOCATOR_SIG) {
    throw new Error("zip64 archives are not accepted");
  }
  const entryCount = u16(data, eocd + 10);
  if (entryCount > limits.maxEntries) {
    throw new Error("zip entry count exceeds limit");
  }
  let cdOffset = u32(data, eocd + 16);
  let inflatedTotal = 0;
  for (let i = 0; i < entryCount; i++) {
    if (Date.now() - started > limits.maxMs) {
      throw new Error("zip parse timeout");
    }
    requireRange(data, cdOffset, 46);
    if (u32(data, cdOffset) !== CD_SIG) {
      throw new Error("invalid zip central directory");
    }
    const compression = u16(data, cdOffset + 10);
    const compressedSize = u32(data, cdOffset + 20);
    const uncompressedSize = u32(data, cdOffset + 24);
    const nameLen = u16(data, cdOffset + 28);
    const extraLen = u16(data, cdOffset + 30);
    const commentLen = u16(data, cdOffset + 32);
    const localOff = u32(data, cdOffset + 42);
    requireRange(data, cdOffset + 46, nameLen);
    const name = Buffer.from(data.subarray(cdOffset + 46, cdOffset + 46 + nameLen)).toString(
      "utf8"
    );
    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (name !== entryName) continue;
    if (uncompressedSize > limits.maxEntryBytes || compressedSize > limits.maxEntryBytes) {
      throw new Error("zip entry exceeds decompressed size limit");
    }
    requireRange(data, localOff, 30);
    if (u32(data, localOff) !== LOCAL_SIG) {
      throw new Error("invalid zip local header");
    }
    const localNameLen = u16(data, localOff + 26);
    const localExtraLen = u16(data, localOff + 28);
    const payloadStart = localOff + 30 + localNameLen + localExtraLen;
    requireRange(data, payloadStart, compressedSize);
    const payload = data.subarray(payloadStart, payloadStart + compressedSize);

    let inflated: Uint8Array;
    if (compression === 0) {
      inflated = payload.slice();
    } else if (compression === 8) {
      const outSize =
        uncompressedSize > 0 ? uncompressedSize : Math.min(limits.maxEntryBytes, payload.length * 64);
      if (outSize > limits.maxEntryBytes) {
        throw new Error("zip entry exceeds decompressed size limit");
      }
      inflated = inflateSync(payload, { out: new Uint8Array(outSize) });
    } else {
      throw new Error("unsupported zip compression");
    }
    inflatedTotal += inflated.length;
    if (inflated.length > limits.maxEntryBytes || inflatedTotal > limits.maxEntryBytes) {
      throw new Error("zip entry exceeds decompressed size limit");
    }
    return inflated;
  }
  return null;
}

/** Keep paragraph breaks so labeled protected attributes stay on their own lines. */
export function xmlToResumeText(xml: string): string {
  return xml
    .replace(/<w:tab[^/]*\/>/g, "\t")
    .replace(/<w:br[^/]*\/?>/g, "\n")
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findEocd(data: Uint8Array): number {
  const min = 22;
  if (data.length < min) throw new Error("invalid zip");
  const earliest = Math.max(0, data.length - min - 65535);
  for (let e = data.length - min; e >= earliest; e--) {
    if (u32(data, e) === EOCD_SIG) return e;
  }
  throw new Error("invalid zip");
}

function requireRange(data: Uint8Array, offset: number, length: number) {
  if (!Number.isFinite(offset) || !Number.isFinite(length) || offset < 0 || length < 0) {
    throw new Error("invalid zip offsets");
  }
  if (offset + length > data.length) {
    throw new Error("invalid zip offsets");
  }
}

function u16(data: Uint8Array, offset: number): number {
  requireRange(data, offset, 2);
  return data[offset]! | (data[offset + 1]! << 8);
}

function u32(data: Uint8Array, offset: number): number {
  requireRange(data, offset, 4);
  return (
    (data[offset]! |
      (data[offset + 1]! << 8) |
      (data[offset + 2]! << 16) |
      (data[offset + 3]! << 24)) >>>
    0
  );
}
