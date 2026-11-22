import { createHash } from "crypto";
import { unzipSync } from "fflate";
import { stripProtectedText } from "./privacy";

export const MAX_RESUME_BYTES = 8 * 1024 * 1024;

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

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const { extractText } = await import("unpdf");
    const result = await extractText(bytes, { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join("\n") : String(result.text || "");
    return text;
  } catch {
    return extractPdfStringsFallback(bytes);
  }
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
    const files = unzipSync(bytes);
    const xmlBytes = files["word/document.xml"];
    if (!xmlBytes) return "";
    const xml = Buffer.from(xmlBytes).toString("utf8");
    return xml
      .replace(/<w:p[^>]*>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}
