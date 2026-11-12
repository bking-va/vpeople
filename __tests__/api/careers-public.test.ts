import {
  PUBLIC_CAREER_OPENING_FIELDS,
  toPublicCareerOpening,
} from "@/lib/careers-public";

describe("public career opening DTO", () => {
  test("keeps only explicit public fields and drops hiring-lead and applicant data", () => {
    const mapped = toPublicCareerOpening({
      id: 9,
      title: "Software Engineer",
      employmentType: "full_time",
      description: "Build HR tools",
      requirements: "TypeScript",
      openDate: "2026-11-01",
      departmentName: "Engineering",
      locationName: "Saskatoon",
      hiringLeadId: 44,
      hiringLeadEmail: "lead@vendasta.com",
      candidateEmail: "applicant@gmail.com",
      applicantCount: 12,
      status: "open",
    });

    expect(Object.keys(mapped).sort()).toEqual(
      [...PUBLIC_CAREER_OPENING_FIELDS].sort()
    );
    expect(mapped).toEqual({
      id: 9,
      title: "Software Engineer",
      employmentType: "full_time",
      description: "Build HR tools",
      requirements: "TypeScript",
      openDate: "2026-11-01",
      departmentName: "Engineering",
      locationName: "Saskatoon",
    });
    expect(JSON.stringify(mapped)).not.toMatch(/hiringLead|applicant|@vendasta|gmail/i);
  });

  test("nulls missing optional public strings instead of leaking FKs", () => {
    const mapped = toPublicCareerOpening({
      id: 1,
      title: "Role",
      employmentType: "full_time",
      description: null,
      requirements: null,
      openDate: null,
      departmentName: null,
      locationName: null,
      departmentId: 3,
      locationId: 8,
    });
    expect(mapped.departmentName).toBeNull();
    expect(mapped.locationName).toBeNull();
    expect(mapped).not.toHaveProperty("departmentId");
    expect(mapped).not.toHaveProperty("locationId");
  });
});
