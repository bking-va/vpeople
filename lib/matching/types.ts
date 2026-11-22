export const LOCATION_REQUIREMENTS = [
  "none",
  "near_office",
  "near_customers",
  "near_office_or_customers",
] as const;

export type LocationRequirement = (typeof LOCATION_REQUIREMENTS)[number];

export type GeoCoords = {
  lat: number;
  lng: number;
};

export type GeoPlace = GeoCoords & {
  label: string;
  kind: "office" | "customer";
};

export type CoarseLocation = {
  city: string | null;
  province: string | null;
  country: string | null;
  postalCode: string | null;
};

export type DistanceHit = {
  km: number;
  label: string;
  kind: "office" | "customer";
};

export type CandidateKind = "employee" | "applicant";

export type ResumeSummary = {
  skills: string[];
  titles: string[];
  education: string[];
  summary: string;
  location: CoarseLocation | null;
};

export type MatchFilters = {
  locationRequirement: LocationRequirement;
  maxDistanceKm: number;
  locationWeight: number;
  includeTerminatedEmployees: boolean;
  includeRejectedApplicants: boolean;
};

export type MatchPerson = {
  key: string;
  employeeId: number | null;
  candidateId: number | null;
  emailNormalized: string;
  kinds: CandidateKind[];
  firstName: string;
  lastName: string;
  currentTitle: string | null;
  employmentStatus: string | null;
  applicantStage: string | null;
  profilePath: string;
  location: CoarseLocation;
  searchText: string;
  evidenceFacts: string[];
  resumeContentHash: string | null;
  resumeBlobUrl: string | null;
};

export type ScoredMatch = {
  key: string;
  employeeId: number | null;
  candidateId: number | null;
  kinds: CandidateKind[];
  firstName: string;
  lastName: string;
  currentTitle: string | null;
  employmentStatus: string | null;
  applicantStage: string | null;
  profilePath: string;
  location: CoarseLocation;
  score: number;
  llmScore: number | null;
  lexicalScore: number;
  proximityScore: number | null;
  distance: DistanceHit | null;
  reasons: string[];
};

export type MatchRunResult = {
  advisory: string;
  model: string;
  results: ScoredMatch[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    uncachedResumes: number;
    shortlistSize: number;
  };
  truncated: boolean;
};

export const MATCHING_ADVISORY =
  "AI rankings are advisory decision-support only. A human must review every match before any hiring action. This search does not reject candidates, change application status, or notify anyone.";

export const DEFAULT_MATCH_FILTERS: MatchFilters = {
  locationRequirement: "none",
  maxDistanceKm: 50,
  locationWeight: 0,
  includeTerminatedEmployees: true,
  includeRejectedApplicants: true,
};
