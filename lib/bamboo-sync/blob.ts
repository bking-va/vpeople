import { randomBytes } from "crypto";

export type PrivateBlobPut = {
  pathname: string;
  body: Buffer;
  contentType?: string | null;
};

export type PrivateBlobStore = {
  putPrivate(input: PrivateBlobPut): Promise<{ url: string }>;
};

const SAFE_NAME = /[^A-Za-z0-9._-]+/g;

export const BAMBOO_BLOB_UNAVAILABLE = "bamboo:unavailable";
export const BAMBOO_RESUME_UNAVAILABLE = BAMBOO_BLOB_UNAVAILABLE;

function isVercelBlobHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "blob.vercel-storage.com" ||
    host.endsWith(".blob.vercel-storage.com")
  );
}

export function isStoredBlobUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.port === "" &&
      parsed.username === "" &&
      parsed.password === "" &&
      isVercelBlobHostname(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function isStoredResumeBlobUrl(
  url: string | null | undefined
): url is string {
  return isStoredBlobUrl(url);
}

export function storedBlobPathname(url: string | null | undefined): string | null {
  if (!isStoredBlobUrl(url)) return null;
  const encodedPath = new URL(url).pathname.replace(/^\/+/, "");
  if (!encodedPath) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
  if (decoded.includes("\\")) return null;
  const parts = decoded.split("/");
  if (parts.some((part) => part === ".." || part === "." || part === "")) return null;
  return encodedPath;
}

export function storedBlobGetUrl(url: string | null | undefined): string | null {
  const pathname = storedBlobPathname(url);
  if (!pathname || !url) return null;
  return `https://${new URL(url).hostname.toLowerCase()}/${pathname}`;
}

export type StoredPrivateBlob = {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
};

export async function getStoredPrivateBlob(
  url: string | null | undefined,
  token: string
): Promise<StoredPrivateBlob | null> {
  const safeUrl = storedBlobGetUrl(url);
  const secret = token.trim();
  if (!safeUrl || !secret) return null;
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(safeUrl, { access: "private", token: secret });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return {
      stream: result.stream,
      contentType: result.blob.contentType || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

export function atsResumeBlobPath(applicationBambooId: string, filename: string): string {
  const id = applicationBambooId.replace(SAFE_NAME, "").slice(0, 64) || "unknown";
  const base = filename.replace(SAFE_NAME, "-").replace(/^\.+/, "").slice(0, 80) || "resume";
  const nonce = randomBytes(12).toString("hex");
  return `ats-resumes/${id}/${nonce}-${base}`;
}

export function createVercelPrivateBlobStore(
  token = process.env.BLOB_READ_WRITE_TOKEN
): PrivateBlobStore | null {
  const secret = token?.trim();
  if (!secret) return null;
  return {
    async putPrivate(input) {
      const { put } = await import("@vercel/blob");
      const blob = await put(input.pathname, input.body, {
        access: "private",
        addRandomSuffix: true,
        token: secret,
        contentType: input.contentType || "application/octet-stream",
      });
      return { url: blob.url };
    },
  };
}
