import { blendScores, nearestPlace, proximityScore } from "./distance";
import { geocodeLocation, loadGeocodeIndexes, type GeocodeIndexes } from "./geocode";
import { lexicalScore } from "./lexical";
import { coarseLocation, formatCoarseLocation, stripProtectedText } from "./privacy";
import type {
  CoarseLocation,
  DistanceHit,
  GeoPlace,
  MatchFilters,
  MatchPerson,
  ResumeSummary,
  ScoredMatch,
} from "./types";

export function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

export function mergePeople(people: MatchPerson[]): MatchPerson[] {
  const byKey = new Map<string, MatchPerson>();
  const emailToKey = new Map<string, string>();

  const keyFor = (person: MatchPerson): string => {
    if (person.employeeId != null) return `e:${person.employeeId}`;
    if (person.emailNormalized && emailToKey.has(person.emailNormalized)) {
      return emailToKey.get(person.emailNormalized)!;
    }
    if (person.emailNormalized) return `mail:${person.emailNormalized}`;
    return person.key;
  };

  for (const person of people) {
    let mergeKey = keyFor(person);
    if (person.emailNormalized && emailToKey.has(person.emailNormalized)) {
      mergeKey = emailToKey.get(person.emailNormalized)!;
    }
    const existing = byKey.get(mergeKey);
    const merged = existing ? combinePeople(existing, person) : { ...person, kinds: [...person.kinds] };
    const nextKey =
      merged.employeeId != null ? `e:${merged.employeeId}` : mergeKey;
    if (nextKey !== mergeKey && byKey.has(mergeKey)) byKey.delete(mergeKey);
    byKey.set(nextKey, { ...merged, key: merged.employeeId != null ? `employee:${merged.employeeId}` : merged.key });
    if (merged.emailNormalized) emailToKey.set(merged.emailNormalized, nextKey);
  }
  return [...byKey.values()];
}

function combinePeople(a: MatchPerson, b: MatchPerson): MatchPerson {
  const kinds = Array.from(new Set([...a.kinds, ...b.kinds]));
  const facts = Array.from(new Set([...a.evidenceFacts, ...b.evidenceFacts]));
  const employeeId = a.employeeId ?? b.employeeId;
  return {
    ...a,
    kinds,
    candidateId: a.candidateId ?? b.candidateId,
    employeeId,
    emailNormalized: a.emailNormalized || b.emailNormalized,
    currentTitle: a.currentTitle || b.currentTitle,
    employmentStatus: a.employmentStatus || b.employmentStatus,
    applicantStage: a.applicantStage || b.applicantStage,
    profilePath: employeeId != null ? `/people/${employeeId}` : a.profilePath || b.profilePath,
    searchText: `${a.searchText} ${b.searchText}`.trim(),
    evidenceFacts: facts,
    resumeContentHash: a.resumeContentHash || b.resumeContentHash,
    resumeBlobUrl: a.resumeBlobUrl || b.resumeBlobUrl,
    resumeEnriched: Boolean(a.resumeEnriched || b.resumeEnriched),
    resumeSummaryApplied: Boolean(a.resumeSummaryApplied || b.resumeSummaryApplied),
    location: pickLocation(a.location, b.location),
    key: employeeId != null ? `employee:${employeeId}` : a.key,
  };
}

function pickLocation(a: CoarseLocation, b: CoarseLocation): CoarseLocation {
  return {
    city: a.city || b.city,
    province: a.province || b.province,
    country: a.country || b.country,
    postalCode: a.postalCode || b.postalCode,
  };
}

export function applyProximity(
  people: MatchPerson[],
  filters: MatchFilters,
  offices: GeoPlace[],
  customers: GeoPlace[],
  indexes: GeocodeIndexes = loadGeocodeIndexes(),
  options: { keepUnknown?: (person: MatchPerson) => boolean } = {}
): Array<MatchPerson & { distance: DistanceHit | null; proximityScore: number | null }> {
  const places = placesForRequirement(filters.locationRequirement, offices, customers);
  const hard = filters.locationRequirement !== "none";
  const out: Array<MatchPerson & { distance: DistanceHit | null; proximityScore: number | null }> =
    [];
  for (const person of people) {
    const coords = geocodeLocation(person.location, indexes);
    const distance = nearestPlace(coords, places);
    if (hard) {
      const unknown = !distance;
      const tooFar = Boolean(distance && distance.km > filters.maxDistanceKm);
      if (tooFar) continue;
      if (unknown && !options.keepUnknown?.(person)) continue;
    }
    out.push({
      ...person,
      distance,
      proximityScore:
        filters.locationRequirement === "none"
          ? null
          : proximityScore(distance?.km ?? null, filters.maxDistanceKm),
    });
  }
  return out;
}

export function applyResumeFacts<T extends MatchPerson>(
  person: T,
  summary: ResumeSummary | null,
  extractedText?: string | null
): T {
  const next = { ...person };
  if (summary) {
    next.searchText = buildSearchText([
      next.searchText,
      summary.summary,
      ...summary.skills,
      ...summary.titles,
      ...summary.education,
    ]);
    next.evidenceFacts = [
      ...next.evidenceFacts,
      summary.summary ? `Résumé summary: ${summary.summary}` : null,
      ...summary.titles.slice(0, 4).map((t) => `Résumé title: ${t}`),
      summary.skills.length ? `Résumé skills: ${summary.skills.slice(0, 12).join(", ")}` : null,
      ...summary.education.slice(0, 3).map((e) => `Résumé education: ${e}`),
    ].filter((f): f is string => Boolean(f));
    if (summary.location) {
      next.location = pickLocation(next.location, summary.location);
    }
    next.resumeEnriched = true;
    next.resumeSummaryApplied = true;
  } else if (extractedText) {
    next.searchText = buildSearchText([next.searchText, extractedText.slice(0, 4000)]);
    next.resumeEnriched = true;
  }
  return next;
}

export function retrievalLimit(
  maxCandidates: number,
  maxUncached: number,
  poolSize: number
): number {
  return Math.min(poolSize, Math.max(maxCandidates * 2, maxCandidates + maxUncached));
}

export function mayGainLocationFromResume(person: MatchPerson): boolean {
  return Boolean(person.resumeBlobUrl) && !person.resumeEnriched;
}

export function placesForRequirement(
  requirement: MatchFilters["locationRequirement"],
  offices: GeoPlace[],
  customers: GeoPlace[]
): GeoPlace[] {
  if (requirement === "near_office") return offices;
  if (requirement === "near_customers") return customers;
  if (requirement === "near_office_or_customers") return [...offices, ...customers];
  return [...offices, ...customers];
}

export function rankShortlist(
  people: Array<MatchPerson & { distance: DistanceHit | null; proximityScore: number | null }>,
  query: string,
  limit: number
): Array<MatchPerson & { distance: DistanceHit | null; proximityScore: number | null; lexicalScore: number }> {
  return people
    .map((person) => ({
      ...person,
      lexicalScore: lexicalScore(query, person.searchText),
    }))
    .sort((a, b) => b.lexicalScore - a.lexicalScore || a.firstName.localeCompare(b.firstName))
    .slice(0, Math.max(1, limit));
}

export function toScoredMatches(
  people: Array<
    MatchPerson & {
      distance: DistanceHit | null;
      proximityScore: number | null;
      lexicalScore: number;
    }
  >,
  llmByKey: Map<string, { score: number; reasons: string[] }>,
  locationWeight: number
): ScoredMatch[] {
  return people
    .map((person) => {
      const llm = llmByKey.get(person.key);
      const llmScore = llm?.score ?? Math.round(person.lexicalScore * 100);
      const score = blendScores(llmScore, person.proximityScore, locationWeight);
      const reasons = (llm?.reasons?.length ? llm.reasons : fallbackReasons(person)).slice(0, 4);
      return {
        key: person.key,
        employeeId: person.employeeId,
        candidateId: person.candidateId,
        kinds: person.kinds,
        firstName: person.firstName,
        lastName: person.lastName,
        currentTitle: person.currentTitle,
        employmentStatus: person.employmentStatus,
        applicantStage: person.applicantStage,
        profilePath: person.profilePath,
        location: person.location,
        score,
        llmScore: llm ? llm.score : null,
        lexicalScore: person.lexicalScore,
        proximityScore: person.proximityScore,
        distance: person.distance,
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score || a.lastName.localeCompare(b.lastName));
}

export function officePlaceFromLocation(row: {
  name: string;
  city: string | null;
  province: string | null;
  country: string;
  postalCode: string | null;
}): { location: CoarseLocation; label: string } | null {
  if (!row.city && !row.postalCode) return null;
  if (row.country.toLowerCase() === "various") return null;
  return {
    label: row.name,
    location: coarseLocation({
      city: row.city,
      province: row.province,
      country: row.country,
      postalCode: row.postalCode,
    }),
  };
}

export function fallbackReasons(
  person: MatchPerson & { distance: DistanceHit | null }
): string[] {
  const reasons: string[] = [];
  if (person.currentTitle) reasons.push(`Current title: ${person.currentTitle}`);
  const loc = formatCoarseLocation(person.location);
  if (loc) reasons.push(`Location on file: ${loc}`);
  if (person.kinds.includes("employee")) reasons.push("In the vPeople employee directory");
  if (person.kinds.includes("applicant")) reasons.push("Has an ATS application on file");
  return reasons.slice(0, 4);
}

export function buildSearchText(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => stripProtectedText(part))
    .filter(Boolean)
    .join(" \n ");
}
