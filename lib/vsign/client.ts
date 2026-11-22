import { defaultSignatureFields, type VsignFieldInput } from "@/lib/vsign/fields";

export class VsignNotConfiguredError extends Error {
  constructor() {
    super("vSign is not configured");
    this.name = "VsignNotConfiguredError";
  }
}

export class VsignApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string
  ) {
    super(message);
    this.name = "VsignApiError";
  }
}

export type VsignSigner = {
  id: string;
  name: string;
  email: string;
  status: string;
  viewedAt?: string | null;
  signedAt?: string | null;
  declinedAt?: string | null;
};

export type VsignEnvelope = {
  id: string;
  status: string;
  title?: string;
  pageCount?: number;
  signers: VsignSigner[];
};

export type CreateEnvelopeInput = {
  title: string;
  message?: string;
  signerName: string;
  signerEmail: string;
  fileName: string;
  fileBytes: Buffer;
  callbackUrl?: string;
};

export type VsignEnv = {
  VSIGN_BASE_URL?: string;
  VSIGN_CLIENT_ID?: string;
  VSIGN_CLIENT_SECRET?: string;
  VSIGN_WEBHOOK_SECRET?: string;
  NEXT_PUBLIC_APP_URL?: string;
  AUTH_URL?: string;
};

function readEnv(env: VsignEnv | NodeJS.ProcessEnv): VsignEnv {
  return {
    VSIGN_BASE_URL: env.VSIGN_BASE_URL,
    VSIGN_CLIENT_ID: env.VSIGN_CLIENT_ID,
    VSIGN_CLIENT_SECRET: env.VSIGN_CLIENT_SECRET,
    VSIGN_WEBHOOK_SECRET: env.VSIGN_WEBHOOK_SECRET,
    NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
    AUTH_URL: env.AUTH_URL,
  };
}

export function isVsignConfigured(env: VsignEnv | NodeJS.ProcessEnv = process.env): boolean {
  const values = readEnv(env);
  return Boolean(
    values.VSIGN_BASE_URL?.trim() &&
      values.VSIGN_CLIENT_ID?.trim() &&
      values.VSIGN_CLIENT_SECRET?.trim() &&
      values.VSIGN_WEBHOOK_SECRET?.trim() &&
      vsignCallbackUrl(values)
  );
}

export function vsignCallbackUrl(env: VsignEnv | NodeJS.ProcessEnv = process.env): string | undefined {
  const values = readEnv(env);
  const base = (values.NEXT_PUBLIC_APP_URL || values.AUTH_URL || "").replace(/\/$/, "");
  if (!base || !base.startsWith("https://")) return undefined;
  return `${base}/api/integrations/vsign/webhook`;
}

function requireConfig(env: VsignEnv) {
  const baseUrl = env.VSIGN_BASE_URL?.trim().replace(/\/$/, "");
  const clientId = env.VSIGN_CLIENT_ID?.trim();
  const clientSecret = env.VSIGN_CLIENT_SECRET?.trim();
  if (!baseUrl || !clientId || !clientSecret) {
    throw new VsignNotConfiguredError();
  }
  return { baseUrl, clientId, clientSecret };
}

function authHeaders(clientId: string, clientSecret: string, actAs: string): HeadersInit {
  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  return {
    Authorization: `Basic ${basic}`,
    "X-VSign-Act-As": actAs,
  };
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as { error?: string };
    if (json.error) return json.error;
  } catch {
    /* raw */
  }
  return text.slice(0, 300) || res.statusText;
}

export function createVsignClient(opts?: {
  env?: VsignEnv | NodeJS.ProcessEnv;
  fetch?: typeof fetch;
}) {
  const env = readEnv(opts?.env ?? process.env);
  const doFetch = opts?.fetch ?? fetch;

  async function request(
    actAs: string,
    method: string,
    path: string,
    init?: { json?: unknown; headers?: HeadersInit }
  ): Promise<Response> {
    const { baseUrl, clientId, clientSecret } = requireConfig(env);
    const headers: Record<string, string> = {
      ...(authHeaders(clientId, clientSecret, actAs) as Record<string, string>),
    };
    if (init?.json !== undefined) {
      headers["content-type"] = "application/json";
    }
    Object.assign(headers, init?.headers);
    const res = await doFetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
    return res;
  }

  return {
    isConfigured: () => isVsignConfigured(env),

    async createDraft(actAs: string, input: CreateEnvelopeInput): Promise<VsignEnvelope> {
      const res = await request(actAs, "POST", "/api/integrations/v1/envelopes", {
        json: {
          title: input.title,
          message: input.message ?? "Please review and sign this document.",
          signingMode: "sequential",
          signers: [{ name: input.signerName, email: input.signerEmail }],
          ccs: [],
          fileBase64: input.fileBytes.toString("base64"),
          fileName: input.fileName,
          callbackUrl: input.callbackUrl,
        },
      });
      if (!res.ok) {
        throw new VsignApiError(`vSign create failed (${res.status})`, res.status, await readError(res));
      }
      const body = (await res.json()) as { envelope?: Record<string, unknown> };
      return parseEnvelope(body.envelope);
    },

    async setFields(actAs: string, envelopeId: string, fields: VsignFieldInput[]): Promise<void> {
      const res = await request(
        actAs,
        "PUT",
        `/api/integrations/v1/envelopes/${encodeURIComponent(envelopeId)}/fields`,
        { json: { fields } }
      );
      if (!res.ok) {
        throw new VsignApiError(`vSign set fields failed (${res.status})`, res.status, await readError(res));
      }
    },

    async send(actAs: string, envelopeId: string): Promise<VsignEnvelope> {
      const res = await request(
        actAs,
        "POST",
        `/api/integrations/v1/envelopes/${encodeURIComponent(envelopeId)}/send`
      );
      if (!res.ok) {
        throw new VsignApiError(`vSign send failed (${res.status})`, res.status, await readError(res));
      }
      const body = (await res.json()) as { envelope?: Record<string, unknown> };
      return parseEnvelope(body.envelope);
    },

    async getEnvelope(actAs: string, envelopeId: string): Promise<VsignEnvelope> {
      const res = await request(
        actAs,
        "GET",
        `/api/integrations/v1/envelopes/${encodeURIComponent(envelopeId)}`
      );
      if (!res.ok) {
        throw new VsignApiError(`vSign get envelope failed (${res.status})`, res.status, await readError(res));
      }
      const body = (await res.json()) as { envelope?: Record<string, unknown> };
      return parseEnvelope(body.envelope);
    },

    async getPdf(actAs: string, envelopeId: string): Promise<Buffer> {
      const res = await request(
        actAs,
        "GET",
        `/api/integrations/v1/envelopes/${encodeURIComponent(envelopeId)}/pdf`
      );
      if (!res.ok) {
        throw new VsignApiError(`vSign pdf failed (${res.status})`, res.status, await readError(res));
      }
      return Buffer.from(await res.arrayBuffer());
    },

    defaultFieldsFor(envelope: VsignEnvelope): VsignFieldInput[] {
      const signerId = envelope.signers[0]?.id;
      if (!signerId) {
        throw new VsignApiError("vSign envelope has no signer", 400);
      }
      return defaultSignatureFields({
        signerId,
        pageCount: envelope.pageCount ?? 1,
      });
    },
  };
}

export type VsignClient = ReturnType<typeof createVsignClient>;

function parseEnvelope(raw: Record<string, unknown> | undefined): VsignEnvelope {
  if (!raw || typeof raw.id !== "string") {
    throw new VsignApiError("vSign returned an envelope without an id", 502);
  }
  const signersRaw = Array.isArray(raw.signers) ? raw.signers : [];
  const signers: VsignSigner[] = signersRaw
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      email: String(row.email ?? ""),
      status: String(row.status ?? ""),
      viewedAt: (row.viewedAt as string | null | undefined) ?? null,
      signedAt: (row.signedAt as string | null | undefined) ?? null,
      declinedAt: (row.declinedAt as string | null | undefined) ?? null,
    }));
  const pages = Array.isArray(raw.pages) ? raw.pages.length : undefined;
  const pageCount =
    typeof raw.pageCount === "number"
      ? raw.pageCount
      : typeof raw.page_count === "number"
        ? raw.page_count
        : pages;
  return {
    id: raw.id,
    status: String(raw.status ?? "draft"),
    title: typeof raw.title === "string" ? raw.title : undefined,
    pageCount,
    signers,
  };
}
