export const SIGNATURE_REQUEST_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "signed",
  "declined",
  "voided",
] as const;

export type SignatureRequestStatus = (typeof SIGNATURE_REQUEST_STATUSES)[number];

export const VSIGN_WEBHOOK_EVENTS = [
  "envelope.sent",
  "signer.viewed",
  "envelope.completed",
  "envelope.declined",
  "envelope.voided",
] as const;

export type VsignWebhookEvent = (typeof VSIGN_WEBHOOK_EVENTS)[number];

const WEBHOOK_TO_STATUS: Record<VsignWebhookEvent, SignatureRequestStatus> = {
  "envelope.sent": "sent",
  "signer.viewed": "viewed",
  "envelope.completed": "signed",
  "envelope.declined": "declined",
  "envelope.voided": "voided",
};

const VSIGN_ENVELOPE_TO_STATUS: Record<string, SignatureRequestStatus> = {
  draft: "draft",
  sent: "sent",
  in_progress: "viewed",
  completed: "signed",
  declined: "declined",
  voided: "voided",
};

export function isVsignWebhookEvent(value: string): value is VsignWebhookEvent {
  return (VSIGN_WEBHOOK_EVENTS as readonly string[]).includes(value);
}

export function statusFromWebhookEvent(event: VsignWebhookEvent): SignatureRequestStatus {
  return WEBHOOK_TO_STATUS[event];
}

export function statusFromVsignEnvelope(status: string): SignatureRequestStatus | null {
  return VSIGN_ENVELOPE_TO_STATUS[status] ?? null;
}

export const ACTIVE_SIGNATURE_STATUSES: SignatureRequestStatus[] = [
  "draft",
  "sent",
  "viewed",
];

export function isActiveSignatureStatus(status: string): boolean {
  return ACTIVE_SIGNATURE_STATUSES.includes(status as SignatureRequestStatus);
}
