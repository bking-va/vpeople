/**
 * RFC 5545 TEXT value escaping for iCalendar properties (SUMMARY, DESCRIPTION, …).
 * Backslash first, then CR/LF as `\n`, then semicolon and comma.
 */
export function escapeIcalText(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}
