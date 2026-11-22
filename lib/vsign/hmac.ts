import { createHmac, timingSafeEqual } from "crypto";

const SIG_RE = /^sha256=([0-9a-fA-F]{64})$/;

export function vsignWebhookSignature(rawBody: string | Buffer, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/** True when header is `sha256=<hex>` of rawBody under secret. */
export function verifyVsignWebhookSignature(
  rawBody: string | Buffer,
  header: string | null | undefined,
  secret: string
): boolean {
  if (!secret) return false;
  const match = SIG_RE.exec((header ?? "").trim());
  if (!match) return false;
  const got = Buffer.from(match[1], "hex");
  const want = Buffer.from(
    createHmac("sha256", secret).update(rawBody).digest("hex"),
    "hex"
  );
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}
