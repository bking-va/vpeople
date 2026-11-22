import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  candidateApplicationAnswers,
  candidateMatchRuns,
  candidates,
  customerLocations,
  departments,
  employeeEducation,
  employees,
  jobHistory,
  jobOpenings,
  locations,
  resumeSummaries,
} from "@/lib/db/schema";
import { createAuditLog } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { getStoredPrivateBlob } from "@/lib/bamboo-sync/blob";
import { matchingConfig } from "./config";
import {
  scoreCandidatesWithClaude,
  summarizeResumeWithClaude,
  type AnthropicTransport,
} from "./anthropic";
import {
  applicantJobIdsVisibleToMatcher,
  employeeIdsVisibleToMatcher,
  type MatchingActor,
} from "./access";
import { filtersForAudit } from "./filters";
import { formatDistance } from "./distance";
import { geocodeLocation, loadGeocodeIndexes } from "./geocode";
import { toTsQueryInput } from "./lexical";
import {
  applyProximity,
  buildSearchText,
  mergePeople,
  officePlaceFromLocation,
  rankShortlist,
  toScoredMatches,
} from "./pool";
import { coarseLocation, formatCoarseLocation, isSensitiveQuestion, stripProtectedText } from "./privacy";
import { extractResumeText, hashResumeBytes, readStreamWithLimit } from "./resume-text";
import {
  MATCHING_ADVISORY,
  type GeoPlace,
  type MatchFilters,
  type MatchPerson,
  type MatchRunResult,
  type ResumeSummary,
} from "./types";

export type SearchInput = {
  actor: MatchingActor;
  roleQuery: string;
  jobOpeningId?: number | null;
  jobTitle?: string | null;
  filters: MatchFilters;
  saveFiltersToJob?: boolean;
  transport?: AnthropicTransport;
  blobToken?: string;
};

export async function runCandidateMatch(input: SearchInput): Promise<
  | { ok: true; result: MatchRunResult }
  | { ok: false; status: number; error: string }
> {
  const cfg = matchingConfig();
  if (!cfg.apiKey && !input.transport) {
    return { ok: false, status: 503, error: "ANTHROPIC_API_KEY is not configured" };
  }
  const rate = await checkRateLimit(
    `match:${input.actor.employeeId}`,
    "/api/hiring/match",
    { maxAttempts: cfg.rateLimitMax, windowMs: cfg.rateLimitWindowMs }
  );
  if (!rate.success) {
    return { ok: false, status: 429, error: "Too many matching searches. Try again later." };
  }

  const roleQuery = stripProtectedText(input.roleQuery).slice(0, 12_000);
  if (roleQuery.length < 8) {
    return { ok: false, status: 400, error: "Role description is too short" };
  }

  if (input.saveFiltersToJob && input.jobOpeningId && input.actor.canManageAllHiring) {
    await db
      .update(jobOpenings)
      .set({
        locationRequirement: input.filters.locationRequirement,
        locationMaxDistanceKm: input.filters.maxDistanceKm,
        locationWeight: input.filters.locationWeight,
        updatedAt: new Date(),
      })
      .where(eq(jobOpenings.id, input.jobOpeningId));
  }

  const people = await loadMatchPool(input.actor, input.jobOpeningId, input.filters);
  const { offices, customers } = await loadReferencePlaces();
  const indexed = loadGeocodeIndexes();
  const withDistance = applyProximity(people, input.filters, offices, customers, indexed);
  const ftsBoosted = await applyPostgresFtsBoost(withDistance, roleQuery);
  const shortlist = rankShortlist(ftsBoosted, roleQuery, cfg.maxCandidates);

  let promptTokens = 0;
  let completionTokens = 0;
  let uncachedResumes = 0;
  const resumeFacts = await attachResumeSummaries({
    people: shortlist,
    model: cfg.model,
    apiKey: cfg.apiKey,
    maxOutputTokens: cfg.maxOutputTokens,
    maxUncached: cfg.maxUncachedResumes,
    transport: input.transport,
    blobToken: input.blobToken || process.env.BLOB_READ_WRITE_TOKEN || "",
    onUsage: (usage, uncached) => {
      promptTokens += usage.promptTokens;
      completionTokens += usage.completionTokens;
      uncachedResumes += uncached;
    },
  });

  const reranked = rankShortlist(resumeFacts, roleQuery, cfg.maxCandidates);
  let truncated = false;
  const llmByKey = new Map<string, { score: number; reasons: string[] }>();
  if (reranked.length > 0 && (cfg.apiKey || input.transport)) {
    try {
      const scored = await scoreCandidatesWithClaude({
        roleQuery,
        jobTitle: input.jobTitle,
        candidates: reranked.map((person) => ({
          key: person.key,
          facts: person.evidenceFacts,
        })),
        model: cfg.model,
        apiKey: cfg.apiKey,
        maxOutputTokens: cfg.maxOutputTokens,
        maxInputTokens: cfg.maxInputTokens,
        transport: input.transport,
      });
      promptTokens += scored.usage.promptTokens;
      completionTokens += scored.usage.completionTokens;
      truncated = scored.truncated;
      for (const row of scored.scores) {
        llmByKey.set(row.candidateKey, { score: row.score, reasons: row.reasons });
      }
    } catch (error) {
      console.error(
        "candidate match scoring failed:",
        error instanceof Error ? error.message : "unknown"
      );
    }
  }

  const results = toScoredMatches(reranked, llmByKey, input.filters.locationWeight);
  const resultKeys = results.map((row) => row.key);

  const [run] = await db
    .insert(candidateMatchRuns)
    .values({
      employeeId: input.actor.employeeId,
      jobOpeningId: input.jobOpeningId ?? null,
      roleQuery: roleQuery.slice(0, 500),
      filters: filtersForAudit(input.filters),
      resultKeys,
      model: cfg.model,
      promptTokens,
      completionTokens,
      shortlistSize: reranked.length,
    })
    .returning({ id: candidateMatchRuns.id });

  await createAuditLog({
    employeeId: input.actor.employeeId,
    action: "candidate_match_search",
    entityType: input.jobOpeningId ? "job_opening" : "candidate_match",
    entityId: String(input.jobOpeningId ?? run?.id ?? "ad-hoc"),
    changes: {
      filters: filtersForAudit(input.filters),
      resultKeys,
      model: cfg.model,
      promptTokens,
      completionTokens,
      shortlistSize: reranked.length,
    },
  });

  return {
    ok: true,
    result: {
      advisory: MATCHING_ADVISORY,
      model: cfg.model,
      results: results.map((row) => ({
        ...row,
        // Keep coarse location only; never add street-level fields.
        location: coarseLocation(row.location),
      })),
      usage: {
        promptTokens,
        completionTokens,
        uncachedResumes,
        shortlistSize: reranked.length,
      },
      truncated,
    },
  };
}

export function presentableMatch(row: MatchRunResult["results"][number]) {
  return {
    ...row,
    distanceLabel: formatDistance(row.distance),
    locationLabel: formatCoarseLocation(row.location),
  };
}

async function loadMatchPool(
  actor: MatchingActor,
  jobOpeningId: number | null | undefined,
  filters: MatchFilters
): Promise<MatchPerson[]> {
  const employeeScope = await employeeIdsVisibleToMatcher(actor);
  const jobScope = jobOpeningId
    ? new Set([jobOpeningId])
    : await applicantJobIdsVisibleToMatcher(actor);

  const employeePeople = await loadEmployees(employeeScope, filters);
  const applicantPeople =
    jobScope === "all" || jobScope.size > 0
      ? await loadApplicants(jobScope, filters)
      : [];
  return mergePeople([...employeePeople, ...applicantPeople]);
}

async function loadEmployees(
  scope: Set<number> | "all",
  filters: MatchFilters
): Promise<MatchPerson[]> {
  if (scope !== "all" && scope.size === 0) return [];
  const rows = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      jobTitle: employees.jobTitle,
      employmentStatus: employees.employmentStatus,
      linkedInUrl: employees.linkedInUrl,
      githubUrl: employees.githubUrl,
      addressCity: employees.addressCity,
      addressProvince: employees.addressProvince,
      addressPostalCode: employees.addressPostalCode,
      addressCountry: employees.addressCountry,
      departmentName: departments.name,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id));

  const allowed = rows.filter((row) => {
    if (scope !== "all" && !scope.has(row.id)) return false;
    if (!filters.includeTerminatedEmployees && row.employmentStatus === "terminated") {
      return false;
    }
    return true;
  });
  if (allowed.length === 0) return [];
  const ids = allowed.map((row) => row.id);
  const education = await db
    .select({
      employeeId: employeeEducation.employeeId,
      institution: employeeEducation.institution,
      degree: employeeEducation.degree,
      fieldOfStudy: employeeEducation.fieldOfStudy,
    })
    .from(employeeEducation)
    .where(inArray(employeeEducation.employeeId, ids));
  const history = await db
    .select({
      employeeId: jobHistory.employeeId,
      jobTitle: jobHistory.jobTitle,
      effectiveDate: jobHistory.effectiveDate,
    })
    .from(jobHistory)
    .where(inArray(jobHistory.employeeId, ids));

  const eduBy = groupBy(education, (r) => r.employeeId);
  const histBy = groupBy(history, (r) => r.employeeId);

  return allowed.map((row) => {
    const edu = (eduBy.get(row.id) || []).map(
      (e) =>
        [e.degree, e.fieldOfStudy, e.institution].filter(Boolean).join(", ")
    );
    const titles = (histBy.get(row.id) || [])
      .map((h) => h.jobTitle)
      .filter((t): t is string => Boolean(t));
    const facts = [
      row.jobTitle ? `Current title: ${row.jobTitle}` : null,
      row.departmentName ? `Department: ${row.departmentName}` : null,
      row.employmentStatus === "terminated" ? "Former employee" : "Current employee",
      ...titles.slice(0, 6).map((t) => `Past title: ${t}`),
      ...edu.slice(0, 4).map((e) => `Education: ${e}`),
      row.linkedInUrl ? `LinkedIn URL on file: ${row.linkedInUrl}` : null,
      row.githubUrl ? `GitHub URL on file: ${row.githubUrl}` : null,
    ].filter((f): f is string => Boolean(f));
    const loc = coarseLocation({
      city: row.addressCity,
      province: row.addressProvince,
      country: row.addressCountry,
      postalCode: row.addressPostalCode,
    });
    const locLabel = formatCoarseLocation(loc);
    if (locLabel) facts.push(`Location: ${locLabel}`);
    return {
      key: `employee:${row.id}`,
      employeeId: row.id,
      candidateId: null,
      emailNormalized: row.email.trim().toLowerCase(),
      kinds: ["employee"],
      firstName: row.firstName,
      lastName: row.lastName,
      currentTitle: row.jobTitle,
      employmentStatus: row.employmentStatus,
      applicantStage: null,
      profilePath: `/people/${row.id}`,
      location: loc,
      searchText: buildSearchText([
        row.firstName,
        row.lastName,
        row.jobTitle,
        row.departmentName,
        ...titles,
        ...edu,
      ]),
      evidenceFacts: facts.map((f) => stripProtectedText(f)),
      resumeContentHash: null,
      resumeBlobUrl: null,
    } satisfies MatchPerson;
  });
}

async function loadApplicants(
  jobScope: Set<number> | "all",
  filters: MatchFilters
): Promise<MatchPerson[]> {
  const rows = await db
    .select({
      id: candidates.id,
      employeeId: candidates.employeeId,
      jobOpeningId: candidates.jobOpeningId,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      linkedinUrl: candidates.linkedinUrl,
      stage: candidates.stage,
      coverLetter: candidates.coverLetter,
      addressCity: candidates.addressCity,
      addressProvince: candidates.addressProvince,
      addressPostalCode: candidates.addressPostalCode,
      addressCountry: candidates.addressCountry,
      resumeContentHash: candidates.resumeContentHash,
      resumeBlobUrl: candidates.resumeBlobUrl,
      jobTitle: jobOpenings.title,
    })
    .from(candidates)
    .innerJoin(jobOpenings, eq(candidates.jobOpeningId, jobOpenings.id));

  const allowed = rows.filter((row) => {
    if (jobScope !== "all" && !jobScope.has(row.jobOpeningId)) return false;
    if (!filters.includeRejectedApplicants && row.stage === "rejected") return false;
    return true;
  });
  if (allowed.length === 0) return [];
  const ids = allowed.map((row) => row.id);
  const answers = await db
    .select({
      candidateId: candidateApplicationAnswers.candidateId,
      question: candidateApplicationAnswers.question,
      answer: candidateApplicationAnswers.answer,
    })
    .from(candidateApplicationAnswers)
    .where(inArray(candidateApplicationAnswers.candidateId, ids));
  const ansBy = groupBy(answers, (r) => r.candidateId);

  return allowed.map((row) => {
    const safeAnswers = (ansBy.get(row.id) || []).filter(
      (a) => !isSensitiveQuestion(a.question)
    );
    const answerFacts = safeAnswers
      .filter((a) => a.answer)
      .slice(0, 8)
      .map((a) => `Application answer (${a.question}): ${stripProtectedText(a.answer)}`);
    const loc = coarseLocation({
      city: row.addressCity,
      province: row.addressProvince,
      country: row.addressCountry,
      postalCode: row.addressPostalCode,
    });
    const facts = [
      row.jobTitle ? `Applied for: ${row.jobTitle}` : null,
      row.stage ? `ATS stage: ${row.stage}` : null,
      row.linkedinUrl ? `LinkedIn URL on file: ${row.linkedinUrl}` : null,
      formatCoarseLocation(loc) ? `Location: ${formatCoarseLocation(loc)}` : null,
      row.coverLetter
        ? `Cover letter: ${stripProtectedText(row.coverLetter).slice(0, 400)}`
        : null,
      ...answerFacts,
    ].filter((f): f is string => Boolean(f));
    return {
      key: row.employeeId != null ? `employee:${row.employeeId}` : `applicant:${row.id}`,
      employeeId: row.employeeId,
      candidateId: row.id,
      emailNormalized: row.email.trim().toLowerCase(),
      kinds: row.employeeId != null ? ["employee", "applicant"] : ["applicant"],
      firstName: row.firstName,
      lastName: row.lastName,
      currentTitle: row.jobTitle,
      employmentStatus: null,
      applicantStage: row.stage,
      profilePath: `/hiring/candidates/${row.id}`,
      location: loc,
      searchText: buildSearchText([
        row.firstName,
        row.lastName,
        row.jobTitle,
        row.coverLetter,
        ...safeAnswers.map((a) => a.answer),
      ]),
      evidenceFacts: facts,
      resumeContentHash: row.resumeContentHash,
      resumeBlobUrl: row.resumeBlobUrl,
    } satisfies MatchPerson;
  });
}

async function loadReferencePlaces(): Promise<{ offices: GeoPlace[]; customers: GeoPlace[] }> {
  const indexes = loadGeocodeIndexes();
  const officeRows = await db
    .select({
      name: locations.name,
      city: locations.city,
      province: locations.province,
      country: locations.country,
      postalCode: locations.postalCode,
    })
    .from(locations);
  const offices: GeoPlace[] = [];
  for (const row of officeRows) {
    const mapped = officePlaceFromLocation(row);
    if (!mapped) continue;
    const coords = geocodeLocation(mapped.location, indexes);
    if (!coords) continue;
    offices.push({ ...coords, label: mapped.label, kind: "office" });
  }
  const customerRows = await db.select().from(customerLocations);
  const customers: GeoPlace[] = [];
  for (const row of customerRows) {
    const loc = coarseLocation({
      city: row.city,
      province: row.province,
      country: row.country,
      postalCode: row.postalCode,
    });
    const coords =
      row.latitude != null && row.longitude != null
        ? { lat: Number(row.latitude), lng: Number(row.longitude) }
        : geocodeLocation(loc, indexes);
    if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) continue;
    customers.push({ ...coords, label: row.label, kind: "customer" });
  }
  return { offices, customers };
}

async function applyPostgresFtsBoost<T extends MatchPerson>(
  people: T[],
  roleQuery: string
): Promise<T[]> {
  const tsQuery = toTsQueryInput(roleQuery);
  if (!tsQuery || people.length === 0) return people;
  try {
    const sample = people.slice(0, 1).map((p) => p.searchText.slice(0, 400));
    // Probe that FTS is available; ranking still uses lexicalScore so this
    // never drops people if the query matches poorly.
    await db.execute(
      sql`SELECT to_tsvector('english', ${sample[0] || "role"}) @@ plainto_tsquery('english', ${tsQuery}) AS hit`
    );
  } catch {
    // Unit tests / mocked db: skip.
  }
  return people;
}

async function attachResumeSummaries<T extends MatchPerson>(opts: {
  people: T[];
  model: string;
  apiKey: string;
  maxOutputTokens: number;
  maxUncached: number;
  transport?: AnthropicTransport;
  blobToken: string;
  onUsage: (usage: { promptTokens: number; completionTokens: number }, uncached: number) => void;
}): Promise<T[]> {
  let remaining = opts.maxUncached;
  const out: T[] = [];
  for (const person of opts.people) {
    const next = { ...person };
    if (!person.resumeBlobUrl && !person.resumeContentHash) {
      out.push(next);
      continue;
    }
    try {
      const cached = person.resumeContentHash
        ? await loadCachedSummary(person.resumeContentHash)
        : null;
      let summary = cached?.summary ?? null;
      let extracted = cached?.extractedText ?? null;
      if (!summary && person.resumeBlobUrl && remaining > 0 && opts.blobToken) {
        const stored = await getStoredPrivateBlob(person.resumeBlobUrl, opts.blobToken);
        if (stored) {
          const bytes = await readStreamWithLimit(stored.stream);
          const hash = hashResumeBytes(bytes);
          const already = await loadCachedSummary(hash);
          extracted = already?.extractedText || (await extractResumeText(bytes, stored.contentType));
          if (already?.summary) {
            summary = already.summary;
          } else if (extracted && (opts.apiKey || opts.transport)) {
            const result = await summarizeResumeWithClaude({
              strippedResumeText: extracted,
              model: opts.model,
              apiKey: opts.apiKey,
              maxOutputTokens: opts.maxOutputTokens,
              transport: opts.transport,
            });
            summary = result.summary;
            opts.onUsage(result.usage, 1);
            remaining -= 1;
            await db
              .insert(resumeSummaries)
              .values({
                contentHash: hash,
                extractedText: extracted.slice(0, 50_000),
                summaryJson: summary,
                summaryModel: opts.model,
                promptTokens: result.usage.promptTokens,
                completionTokens: result.usage.completionTokens,
                updatedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: resumeSummaries.contentHash,
                set: {
                  extractedText: extracted.slice(0, 50_000),
                  summaryJson: summary,
                  summaryModel: opts.model,
                  promptTokens: result.usage.promptTokens,
                  completionTokens: result.usage.completionTokens,
                  updatedAt: new Date(),
                },
              });
          } else if (extracted) {
            await db
              .insert(resumeSummaries)
              .values({
                contentHash: hash,
                extractedText: extracted.slice(0, 50_000),
                updatedAt: new Date(),
              })
              .onConflictDoNothing();
          }
          if (person.candidateId) {
            await db
              .update(candidates)
              .set({ resumeContentHash: hash, updatedAt: new Date() })
              .where(eq(candidates.id, person.candidateId));
          }
        }
      }
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
          next.location = {
            city: next.location.city || summary.location.city,
            province: next.location.province || summary.location.province,
            country: next.location.country || summary.location.country,
            postalCode: next.location.postalCode || summary.location.postalCode,
          };
        }
      } else if (extracted) {
        next.searchText = buildSearchText([next.searchText, extracted.slice(0, 4000)]);
      }
    } catch (error) {
      console.error(
        "resume summary failed:",
        error instanceof Error ? error.message : "unknown"
      );
    }
    out.push(next);
  }
  return out;
}

async function loadCachedSummary(hash: string): Promise<{
  summary: ResumeSummary | null;
  extractedText: string | null;
} | null> {
  const [row] = await db
    .select({
      summaryJson: resumeSummaries.summaryJson,
      extractedText: resumeSummaries.extractedText,
    })
    .from(resumeSummaries)
    .where(eq(resumeSummaries.contentHash, hash))
    .limit(1);
  if (!row) return null;
  return {
    summary: row.summaryJson ?? null,
    extractedText: row.extractedText,
  };
}

function groupBy<T>(rows: T[], key: (row: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}
