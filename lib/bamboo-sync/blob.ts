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
