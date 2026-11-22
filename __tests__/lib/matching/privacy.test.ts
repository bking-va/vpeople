import {
  isSensitiveQuestion,
  omitProtectedFields,
  sanitizeResumeSummary,
  stripProtectedText,
} from "@/lib/matching/privacy";

describe("matching privacy", () => {
  test("strips SIN/SSN, street address, compensation, and labeled protected lines", () => {
    const raw = [
      "Jane Doe",
      "123 Main Street, Saskatoon",
      "SSN: 123-45-6789",
      "SIN 123 456 789",
      "Gender: Female",
      "Date of birth: 1990-01-01",
      "Salary: $120,000 CAD",
      "TypeScript, React, Postgres",
      "Apt #12",
    ].join("\n");
    const stripped = stripProtectedText(raw);
    expect(stripped).toContain("Jane Doe");
    expect(stripped).toContain("TypeScript");
    expect(stripped).not.toMatch(/123-45-6789/);
    expect(stripped).not.toMatch(/Main Street/i);
    expect(stripped).not.toMatch(/Gender/i);
    expect(stripped).not.toMatch(/1990-01-01/);
    expect(stripped).not.toMatch(/120,000/);
    expect(stripped.toLowerCase()).not.toContain("female");
  });

  test("does not pass structured protected fields into the model payload", () => {
    const omitted = omitProtectedFields({
      jobTitle: "Engineer",
      gender: "female",
      birthDate: "1990-01-01",
      sin: "123456789",
      addressStreet1: "123 Main",
      addressCity: "Saskatoon",
      salary: 100,
    });
    expect(omitted).toEqual({ jobTitle: "Engineer", addressCity: "Saskatoon" });
  });

  test("drops sensitive application questions", () => {
    expect(isSensitiveQuestion("What is your gender?")).toBe(true);
    expect(isSensitiveQuestion("Veteran status")).toBe(true);
    expect(isSensitiveQuestion("Why do you want this role?")).toBe(false);
  });

  test("sanitizes résumé summary JSON", () => {
    const summary = sanitizeResumeSummary({
      skills: ["TypeScript", "Gender: n/a"],
      titles: ["Staff Engineer"],
      education: ["BSc Computer Science"],
      summary: "Built HR tools. Salary: $200k.",
      location: { city: "Saskatoon", province: "SK", country: "Canada", postalCode: "S7K 1A1" },
    });
    expect(summary?.titles).toEqual(["Staff Engineer"]);
    expect(summary?.location?.city).toBe("Saskatoon");
    expect(summary?.summary).not.toMatch(/200k/);
  });
});
