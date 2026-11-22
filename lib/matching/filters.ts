import {
  DEFAULT_MATCH_FILTERS,
  LOCATION_REQUIREMENTS,
  type LocationRequirement,
  type MatchFilters,
} from "./types";

export function parseLocationRequirement(value: unknown): LocationRequirement {
  if (typeof value === "string" && (LOCATION_REQUIREMENTS as readonly string[]).includes(value)) {
    return value as LocationRequirement;
  }
  return "none";
}

export function parseMaxDistanceKm(value: unknown, fallback = 50): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(20_000, Math.max(1, Math.round(n)));
}

export function parseLocationWeight(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function parseMatchFilters(
  input: Record<string, unknown> | null | undefined,
  defaults: MatchFilters = DEFAULT_MATCH_FILTERS
): MatchFilters {
  const src = input ?? {};
  return {
    locationRequirement: parseLocationRequirement(
      src.locationRequirement ?? defaults.locationRequirement
    ),
    maxDistanceKm: parseMaxDistanceKm(src.maxDistanceKm ?? src.locationMaxDistanceKm, defaults.maxDistanceKm),
    locationWeight: parseLocationWeight(src.locationWeight ?? defaults.locationWeight),
    includeTerminatedEmployees:
      src.includeTerminatedEmployees === undefined
        ? defaults.includeTerminatedEmployees
        : Boolean(src.includeTerminatedEmployees),
    includeRejectedApplicants:
      src.includeRejectedApplicants === undefined
        ? defaults.includeRejectedApplicants
        : Boolean(src.includeRejectedApplicants),
  };
}

export function locationSettingsFromBody(data: Record<string, unknown>) {
  const parsed = parseMatchFilters(data);
  return {
    locationRequirement: parsed.locationRequirement,
    locationMaxDistanceKm: parsed.maxDistanceKm,
    locationWeight: parsed.locationWeight,
  };
}

export function filtersForAudit(filters: MatchFilters): Record<string, unknown> {
  return {
    locationRequirement: filters.locationRequirement,
    maxDistanceKm: filters.maxDistanceKm,
    locationWeight: filters.locationWeight,
    includeTerminatedEmployees: filters.includeTerminatedEmployees,
    includeRejectedApplicants: filters.includeRejectedApplicants,
  };
}
