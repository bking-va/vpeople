import { haversineKm } from "@/lib/matching/distance";
import {
  geocodeLocation,
  loadGeocodeIndexes,
  postalLookupKeys,
} from "@/lib/matching/geocode";
import { applyProximity, mergePeople } from "@/lib/matching/pool";
import type { MatchPerson } from "@/lib/matching/types";

const indexes = loadGeocodeIndexes();

function person(partial: Partial<MatchPerson> & Pick<MatchPerson, "key" | "firstName">): MatchPerson {
  return {
    lastName: "Test",
    employeeId: null,
    candidateId: null,
    emailNormalized: `${partial.firstName.toLowerCase()}@vendasta.com`,
    kinds: ["employee"],
    currentTitle: "Engineer",
    employmentStatus: "full_time",
    applicantStage: null,
    profilePath: "/people/1",
    location: { city: null, province: null, country: null, postalCode: null },
    searchText: "engineer typescript",
    evidenceFacts: ["Current title: Engineer"],
    resumeContentHash: null,
    resumeBlobUrl: null,
    ...partial,
  };
}

describe("offline geocoding", () => {
  test("geocodes Saskatoon by city and by FSA without a third-party call", () => {
    const city = geocodeLocation(
      { city: "Saskatoon", province: "Saskatchewan", country: "Canada", postalCode: null },
      indexes
    );
    const fsa = geocodeLocation(
      { city: null, province: null, country: "Canada", postalCode: "S7K 2M2" },
      indexes
    );
    expect(city?.lat).toBeCloseTo(52.13, 0);
    expect(fsa?.lat).toBeCloseTo(52.15, 0);
    expect(postalLookupKeys("S7K2M2", "CA")).toEqual(["CA|S7K"]);
  });

  test("geocodes US ZIP, Toronto FSA, Boca Raton, and Chennai PIN prefix", () => {
    expect(geocodeLocation({ city: null, province: null, country: "US", postalCode: "33431" }, indexes)?.lat).toBeCloseTo(26.36, 0);
    expect(geocodeLocation({ city: "Toronto", province: "ON", country: "Canada", postalCode: null }, indexes)?.lng).toBeCloseTo(-79.4, 0);
    expect(geocodeLocation({ city: "Boca Raton", province: "Florida", country: "United States", postalCode: null }, indexes)?.lat).toBeCloseTo(26.36, 0);
    expect(geocodeLocation({ city: null, province: null, country: "India", postalCode: "600089" }, indexes)?.lat).toBeCloseTo(13.05, 0);
  });

  test("does not guess ambiguous US cities without a state", () => {
    const springfield = geocodeLocation(
      { city: "Springfield", province: null, country: "United States", postalCode: null },
      indexes
    );
    expect(springfield).toBeNull();
  });

  test("haversine is about 2300 km between Saskatoon and Chennai", () => {
    const sk = geocodeLocation({ city: "Saskatoon", province: "SK", country: "CA", postalCode: null }, indexes)!;
    const chennai = geocodeLocation({ city: "Chennai", province: "Tamil Nadu", country: "IN", postalCode: null }, indexes)!;
    const km = haversineKm(sk, chennai);
    expect(km).toBeGreaterThan(10_000);
    expect(km).toBeLessThan(15_000);
  });
});

describe("matching pool", () => {
  test("dedupes employee and applicant who share an email", () => {
    const merged = mergePeople([
      person({
        key: "applicant:9",
        firstName: "Ada",
        candidateId: 9,
        kinds: ["applicant"],
        emailNormalized: "ada@vendasta.com",
      }),
      person({
        key: "employee:3",
        firstName: "Ada",
        employeeId: 3,
        kinds: ["employee"],
        emailNormalized: "ada@vendasta.com",
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].employeeId).toBe(3);
    expect(merged[0].candidateId).toBe(9);
    expect(merged[0].kinds.sort()).toEqual(["applicant", "employee"]);
  });

  test("hard-filters people farther than max distance when near_office is set", () => {
    const saskatoon = geocodeLocation({ city: "Saskatoon", province: "SK", country: "CA", postalCode: null }, indexes)!;
    const people = [
      person({
        key: "employee:1",
        firstName: "Local",
        employeeId: 1,
        location: { city: "Saskatoon", province: "SK", country: "Canada", postalCode: "S7K" },
      }),
      person({
        key: "employee:2",
        firstName: "Far",
        employeeId: 2,
        location: { city: "Chennai", province: "Tamil Nadu", country: "India", postalCode: null },
      }),
    ];
    const kept = applyProximity(
      people,
      {
        locationRequirement: "near_office",
        maxDistanceKm: 100,
        locationWeight: 80,
        includeTerminatedEmployees: true,
        includeRejectedApplicants: true,
      },
      [{ ...saskatoon, label: "Saskatoon HQ", kind: "office" }],
      [],
      indexes
    );
    expect(kept.map((p) => p.firstName)).toEqual(["Local"]);
    expect(kept[0].distance?.label).toBe("Saskatoon HQ");
  });
});
