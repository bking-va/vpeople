import { escapeIcalText } from "@/lib/ical";
import {
  personNameContainsControlChars,
  sanitizePersonNameFields,
  UNSAFE_PERSON_NAME_MESSAGE,
} from "@/lib/person-name";

describe("escapeIcalText", () => {
  test("escapes backslash, semicolon, comma, and newlines in RFC 5545 order", () => {
    expect(escapeIcalText("back\\slash")).toBe("back\\\\slash");
    expect(escapeIcalText("Last;Jr")).toBe("Last\\;Jr");
    expect(escapeIcalText("Last, Jr")).toBe("Last\\, Jr");
    expect(escapeIcalText("Line\nBreak")).toBe("Line\\nBreak");
    expect(escapeIcalText("Line\rBreak")).toBe("Line\\nBreak");
    expect(escapeIcalText("Line\r\nBreak")).toBe("Line\\nBreak");
  });

  test("neutralizes injected iCalendar properties in names", () => {
    const injected = "Ada\nBEGIN:VEVENT\nSUMMARY:Pwned";
    const escaped = escapeIcalText(injected);
    expect(escaped).toBe("Ada\\nBEGIN:VEVENT\\nSUMMARY:Pwned");
    expect(escaped).not.toMatch(/\nBEGIN:VEVENT/);
    expect(escapeIcalText("Name;TZID=UTC,evil")).toBe("Name\\;TZID=UTC\\,evil");
  });

  test("treats nullish values as empty TEXT", () => {
    expect(escapeIcalText(null)).toBe("");
    expect(escapeIcalText(undefined)).toBe("");
  });
});

describe("person name control-character rejection", () => {
  test("rejects CR, LF, and other control characters", () => {
    expect(personNameContainsControlChars("Ada\nLovelace")).toBe(true);
    expect(personNameContainsControlChars("Ada\rLovelace")).toBe(true);
    expect(personNameContainsControlChars("Ada\tLovelace")).toBe(true);
    expect(personNameContainsControlChars("Ada\u0000Lovelace")).toBe(true);
    expect(personNameContainsControlChars("Ada\u007FLovelace")).toBe(true);
    expect(personNameContainsControlChars("Ada\u2028Lovelace")).toBe(true);
    expect(personNameContainsControlChars("Ada Lovelace")).toBe(false);
    expect(personNameContainsControlChars("O'Neill-Smith")).toBe(false);
  });

  test("sanitizePersonNameFields throws on unsafe name writes", () => {
    expect(() =>
      sanitizePersonNameFields({ firstName: "Ada\nBEGIN:VEVENT", lastName: "Lovelace" })
    ).toThrow(UNSAFE_PERSON_NAME_MESSAGE);
    expect(() =>
      sanitizePersonNameFields({ preferredName: "Ada\r\nLovelace" })
    ).toThrow(UNSAFE_PERSON_NAME_MESSAGE);
    expect(sanitizePersonNameFields({ firstName: "Ada", lastName: "Lovelace" })).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });
});
