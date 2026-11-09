const UNSAFE_PERSON_NAME = /[\u0000-\u001F\u007F\u2028\u2029]/;

export const UNSAFE_PERSON_NAME_MESSAGE =
  "Names cannot contain control characters or newlines";

export function personNameContainsControlChars(value: string): boolean {
  return UNSAFE_PERSON_NAME.test(value);
}

/** Returns the value, or throws if it contains CR/LF or other control characters. */
export function rejectUnsafePersonName(
  value: string | null | undefined
): string | null | undefined {
  if (value == null) return value;
  if (personNameContainsControlChars(value)) {
    throw new Error(UNSAFE_PERSON_NAME_MESSAGE);
  }
  return value;
}

const PERSON_NAME_KEYS = ["firstName", "lastName", "middleName", "preferredName"] as const;

export function sanitizePersonNameFields<T extends Record<string, unknown>>(data: T): T {
  const next: Record<string, unknown> = { ...data };
  for (const key of PERSON_NAME_KEYS) {
    const value = next[key];
    if (typeof value !== "string") continue;
    next[key] = rejectUnsafePersonName(value);
  }
  return next as T;
}
