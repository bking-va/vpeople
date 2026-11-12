import {
  HIRE_PREFILL_FIELDS,
  canOpenEmployeeCreate,
  hirePrefillHasForbiddenKeys,
  resolveCreatedAccessLevel,
  safeHirePrefill,
} from "@/lib/hire-employee";

const candidate = {
  id: 44,
  firstName: "Sam",
  lastName: "Hire",
  email: "sam.hire@gmail.com",
  phone: "+1-555-0100",
  linkedinUrl: "https://linkedin.com/in/sam",
  resumeUrl: "https://blob.example/resume.pdf",
  rating: 5,
};

describe("hired → employee prefill", () => {
  test("copies only safe already-known fields and never salary or resume", () => {
    const prefill = safeHirePrefill({
      candidate,
      opening: {
        title: "Engineer",
        departmentId: 3,
        locationId: 8,
        employmentType: "full_time",
      },
      offer: {
        jobTitle: "Senior Engineer",
        startDate: "2026-12-01",
        salary: "140000",
      },
    });

    expect(Object.keys(prefill).sort()).toEqual([...HIRE_PREFILL_FIELDS].sort());
    expect(prefill).toEqual({
      candidateId: 44,
      firstName: "Sam",
      lastName: "Hire",
      email: "sam.hire@gmail.com",
      workPhone: "+1-555-0100",
      linkedInUrl: "https://linkedin.com/in/sam",
      jobTitle: "Senior Engineer",
      departmentId: "3",
      locationId: "8",
      hireDate: "2026-12-01",
      employmentStatus: "full_time",
    });
    expect(JSON.stringify(prefill)).not.toMatch(/salary|resume|rating|140000/i);
    expect(hirePrefillHasForbiddenKeys(prefill as unknown as Record<string, unknown>)).toBe(
      false
    );
  });

  test("falls back to opening title and leaves hire date empty without an offer", () => {
    const prefill = safeHirePrefill({
      candidate: { ...candidate, phone: null, linkedinUrl: null },
      opening: { title: "Support", departmentId: null, locationId: 2 },
      offer: null,
    });
    expect(prefill.jobTitle).toBe("Support");
    expect(prefill.hireDate).toBe("");
    expect(prefill.departmentId).toBe("");
    expect(prefill.locationId).toBe("2");
    expect(prefill.workPhone).toBe("");
  });

  test("hiring lead can open the wizard only from a hired candidate", () => {
    expect(
      canOpenEmployeeCreate({
        isHrOrAdmin: false,
        fromHiredCandidate: true,
        hiringAllowed: true,
      })
    ).toBe(true);
    expect(
      canOpenEmployeeCreate({
        isHrOrAdmin: false,
        fromHiredCandidate: false,
        hiringAllowed: true,
      })
    ).toBe(false);
    expect(
      canOpenEmployeeCreate({
        isHrOrAdmin: true,
        fromHiredCandidate: false,
        hiringAllowed: false,
      })
    ).toBe(true);
  });

  test("hiring leads cannot choose a privileged access level", () => {
    expect(
      resolveCreatedAccessLevel({ requested: "full_admin", isHrOrAdmin: false })
    ).toBe("employee");
    expect(
      resolveCreatedAccessLevel({ requested: "manager", isHrOrAdmin: true })
    ).toBe("manager");
  });
});
