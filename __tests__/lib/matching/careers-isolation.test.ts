import { toPublicCareerOpening } from "@/lib/careers-public";

describe("matching stays off the public careers page", () => {
  test("public opening DTO has no matching, résumé, or candidate fields", () => {
    const mapped = toPublicCareerOpening({
      id: 1,
      title: "Engineer",
      employmentType: "full_time",
      description: "Build",
      requirements: "TS",
      openDate: "2026-01-01",
      departmentName: "Engineering",
      locationName: "Saskatoon",
    });
    const json = JSON.stringify(mapped);
    expect(json).not.toMatch(/match|résumé|resume|candidate|anthropic|score/i);
  });
});
