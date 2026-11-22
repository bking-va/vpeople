import type { CoarseLocation, ResumeSummary } from "./types";

const SSN = /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g;
const SIN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g;
const DOB_LABEL =
  /\b(?:d\.?o\.?b\.?|date of birth|birth ?date|born on|age)\s*[:\-–]?\s*[^\n]{0,40}/gi;
const AGE_YEARS = /\b(?:age|aged)\s*[:\-]?\s*\d{1,3}\b/gi;
const STREET =
  /\b\d{1,6}\s+[A-Za-z0-9.'#-]+(?:\s+[A-Za-z0-9.'#-]+){0,4}\s+(?:street|st\.?|avenue|ave\.?|road|rd\.?|drive|dr\.?|boulevard|blvd\.?|lane|ln\.?|court|ct\.?|way|place|pl\.?|circle|cir\.?|crescent|cres\.?|terrace|ter\.?|parkway|pkwy\.?|highway|hwy\.?)\b[^\n]*/gi;
const PO_BOX = /\bP\.?\s*O\.?\s*Box\s+\d+\b[^\n]*/gi;
const UNIT = /\b(?:apt|apartment|suite|unit|ste)\.?\s*#?\s*[A-Za-z0-9-]+\b/gi;
const BANK =
  /\b(?:routing|iban|swift|sort code|account(?:\s*number)?|transit)\s*[:#]?\s*[A-Za-z0-9 -]{4,34}\b/gi;
const COMP =
  /\b(?:salary|compensation|pay rate|base pay|hourly rate|annual pay|stock options?|equity|bonus)\s*[:\-]?\s*\$?\s*[0-9,]+\s*(?:k|per\s*(?:year|annum|hour)|usd|cad)?\b/gi;
const PHOTO = /\b(?:headshot|profile photo|photograph|portrait)\b[^\n]*/gi;

const SENSITIVE_LINE =
  /^(?:\s*(?:gender|sex|ethnicity|race|nationality|citizenship|marital status|married|spouse|disability|disabled|veteran(?: status)?|protected veteran|sexual orientation|religion|pregnant|pregnancy|ssn|sin|social security|social insurance|date of birth|d\.?o\.?b\.?|age|bank|routing|iban|swift|salary|compensation|desired pay))\b/i;

const SENSITIVE_QUESTION =
  /gender|sex\b|ethnicity|race\b|hispanic|national origin|marital|disability|disabled|veteran|sexual orientation|religion|pregnant|pregnancy|date of birth|age\b|ssn|sin\b|social security|social insurance|bank account|routing number|iban|salary|compensation|desired pay|current pay/i;

const PROTECTED_FIELD_KEYS = new Set([
  "birthDate",
  "dateOfBirth",
  "dob",
  "age",
  "gender",
  "sex",
  "ethnicity",
  "race",
  "maritalStatus",
  "disability",
  "veteranStatus",
  "photoUrl",
  "image",
  "sin",
  "ssn",
  "socialSecurityNumber",
  "socialInsuranceNumber",
  "addressStreet1",
  "addressStreet2",
  "address1",
  "address2",
  "street",
  "payRate",
  "salary",
  "compensation",
  "bankAccount",
  "bankRouting",
  "iban",
]);

export function isProtectedFieldKey(key: string): boolean {
  return PROTECTED_FIELD_KEYS.has(key) || SENSITIVE_QUESTION.test(key);
}

export function isSensitiveQuestion(question: string | null | undefined): boolean {
  if (!question) return false;
  return SENSITIVE_QUESTION.test(question);
}

/** Strip protected attributes and street-level address from free text. */
export function stripProtectedText(input: string | null | undefined): string {
  if (!input) return "";
  let text = input.replace(/\r\n/g, "\n");
  text = text.replace(SSN, "[redacted]");
  text = text.replace(SIN, "[redacted]");
  text = text.replace(DOB_LABEL, "[redacted]");
  text = text.replace(AGE_YEARS, "[redacted]");
  text = text.replace(STREET, "[redacted]");
  text = text.replace(PO_BOX, "[redacted]");
  text = text.replace(UNIT, "");
  text = text.replace(BANK, "[redacted]");
  text = text.replace(COMP, "[redacted]");
  text = text.replace(PHOTO, "");
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (SENSITIVE_LINE.test(trimmed)) continue;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function coarseLocation(input: {
  city?: string | null;
  province?: string | null;
  country?: string | null;
  postalCode?: string | null;
  addressCity?: string | null;
  addressProvince?: string | null;
  addressCountry?: string | null;
  addressPostalCode?: string | null;
}): CoarseLocation {
  return {
    city: blank(input.city ?? input.addressCity),
    province: blank(input.province ?? input.addressProvince),
    country: blank(input.country ?? input.addressCountry),
    postalCode: blank(input.postalCode ?? input.addressPostalCode),
  };
}

export function formatCoarseLocation(loc: CoarseLocation): string | null {
  const parts = [loc.city, loc.province, loc.country].filter(Boolean);
  if (loc.postalCode) parts.push(loc.postalCode);
  return parts.length ? parts.join(", ") : null;
}

export function omitProtectedFields<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (isProtectedFieldKey(key)) continue;
    out[key] = value;
  }
  return out as T;
}

export function sanitizeResumeSummary(raw: unknown): ResumeSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const locationRaw =
    rec.location && typeof rec.location === "object"
      ? (rec.location as Record<string, unknown>)
      : null;
  return {
    skills: stringList(rec.skills).slice(0, 24),
    titles: stringList(rec.titles).slice(0, 16),
    education: stringList(rec.education).slice(0, 8),
    summary: stripProtectedText(typeof rec.summary === "string" ? rec.summary : "").slice(
      0,
      1200
    ),
    location: locationRaw
      ? coarseLocation({
          city: str(locationRaw.city),
          province: str(locationRaw.province),
          country: str(locationRaw.country),
          postalCode: str(locationRaw.postalCode),
        })
      : null,
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => stripProtectedText(item).slice(0, 120))
    .filter(Boolean);
}

function str(value: unknown): string | null {
  return typeof value === "string" ? blank(value) : null;
}

function blank(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}
