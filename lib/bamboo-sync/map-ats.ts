import { asRecord, labeledValue, nestedId } from "./map-extended";
import { blankToNull } from "./map";
import type {
  CandidateSource,
  CandidateStage,
  MappedAtsAnswerWrite,
  MappedAtsApplicationWrite,
  MappedAtsCommentWrite,
  MappedAtsStatusHistoryWrite,
} from "./types";

const EXCLUDED_KEY = /ssn|sin|bank|iban|routing|credit.?card|national.?id|nin|passport/i;

export function formatBambooNewSince(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

export function mapCandidateSource(value: unknown): {
  source: CandidateSource;
  detail: string | null;
} {
  const raw = labeledValue(value) || blankToNull(value);
  const detail = raw;
  if (!raw) return { source: "other", detail: null };
  const normalized = raw.toLowerCase().replace(/[_-]+/g, " ").trim();
  if (normalized.includes("linkedin")) return { source: "linkedin", detail };
  if (normalized.includes("indeed")) return { source: "indeed", detail };
  if (normalized.includes("glassdoor")) return { source: "glassdoor", detail };
  if (normalized.includes("refer")) return { source: "referral", detail };
  if (
    normalized.includes("career") ||
    normalized.includes("website") ||
    normalized.includes("direct") ||
    normalized.includes("applied")
  ) {
    return { source: "direct", detail };
  }
  return { source: "other", detail };
}

export function mapApplicationStage(
  value: unknown,
  statusesById: Map<string, { code?: number | null; name: string; kind?: string }> = new Map()
): CandidateStage {
  const rec = asRecord(value);
  const id = nestedId(rec.id) || blankToNull(rec.id);
  const fromList = id ? statusesById.get(id) : undefined;
  const label = (
    labeledValue(value) ||
    fromList?.name ||
    blankToNull(rec.label) ||
    blankToNull(rec.name) ||
    ""
  )
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .trim();
  if (label.includes("hire")) return "hired";
  if (label.includes("offer")) return "offer";
  if (label.includes("interview")) return "interview";
  if (label.includes("phone") || label.includes("screen")) return "phone_screen";
  if (
    label.includes("reject") ||
    label.includes("decline") ||
    label.includes("withdraw") ||
    label.includes("inactive") ||
    label.includes("not selected")
  ) {
    return "rejected";
  }
  if (label.includes("new") || label.includes("applied") || label.includes("received")) {
    return "new";
  }
  const kind = (fromList?.kind || blankToNull(rec.code) || "").toLowerCase();
  if (kind.includes("hired")) return "hired";
  if (kind.includes("inactive")) return "rejected";
  if (kind.includes("active")) return "interview";
  if (kind.includes("new")) return "new";
  return "new";
}

function dropSecretFields(raw: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (EXCLUDED_KEY.test(key)) continue;
    next[key] = value;
  }
  return next;
}

function applicantRecord(raw: Record<string, unknown>): Record<string, unknown> {
  return dropSecretFields(
    asRecord(raw.applicant) || asRecord(raw.candidate) || asRecord(raw.contact)
  );
}

export function mapAtsApplication(
  rawInput: Record<string, unknown>,
  statusesById: Map<string, { code?: number | null; name: string; kind?: string }> = new Map()
): MappedAtsApplicationWrite | null {
  const raw = dropSecretFields(rawInput);
  const bambooId = nestedId(raw.id) || blankToNull(raw.id);
  const applicant = applicantRecord(raw);
  const job = asRecord(raw.job) || asRecord(raw.jobOpening);
  const jobBambooId =
    nestedId(job.id) ||
    blankToNull(job.id) ||
    nestedId(raw.jobId) ||
    blankToNull(raw.jobId);
  const firstName =
    blankToNull(applicant.firstName) ||
    blankToNull(raw.firstName) ||
    "Unknown";
  const lastName =
    blankToNull(applicant.lastName) ||
    blankToNull(raw.lastName) ||
    "Unknown";
  if (!bambooId || !jobBambooId) return null;
  const email =
    blankToNull(applicant.email) ||
    blankToNull(raw.email) ||
    `unknown+app-${bambooId}@invalid.local`;
  const statusValue = raw.status || raw.applicationStatus;
  const statusRec = asRecord(statusValue);
  const source = mapCandidateSource(raw.source || applicant.source);
  const ratingRaw = Number(raw.rating ?? applicant.rating);
  const rating =
    Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5
      ? ratingRaw
      : null;
  return {
    bambooId,
    jobBambooId,
    jobTitle: labeledValue(job.title) || labeledValue(job) || "Untitled opening",
    firstName,
    lastName,
    email,
    phone:
      blankToNull(applicant.phone) ||
      blankToNull(applicant.phoneNumber) ||
      blankToNull(raw.phone),
    linkedinUrl:
      blankToNull(applicant.linkedin) ||
      blankToNull(applicant.linkedInUrl) ||
      blankToNull(raw.linkedinUrl),
    source: source.source,
    sourceDetail: source.detail,
    stage: mapApplicationStage(statusValue, statusesById),
    bambooStatusId: nestedId(statusRec.id) || blankToNull(statusRec.id),
    bambooStatusLabel: labeledValue(statusValue) || blankToNull(statusRec.label),
    rating,
    appliedAt:
      blankToNull(raw.appliedDate) ||
      blankToNull(raw.applied) ||
      blankToNull(raw.createdDate) ||
      null,
    coverLetter:
      blankToNull(raw.coverLetter) ||
      blankToNull(raw.cover_letter) ||
      blankToNull(applicant.coverLetter),
    resumeBambooFileId:
      nestedId(raw.resumeFileId) ||
      blankToNull(raw.resumeFileId) ||
      nestedId(asRecord(raw.resume).fileId) ||
      blankToNull(asRecord(raw.resume).id) ||
      nestedId(applicant.resumeFileId) ||
      blankToNull(applicant.resumeFileId),
  };
}

function questionText(row: Record<string, unknown>): string | null {
  return (
    blankToNull(row.question) ||
    blankToNull(row.label) ||
    labeledValue(row.question) ||
    labeledValue(row)
  );
}

function answerText(row: Record<string, unknown>): string | null {
  const value = row.answer ?? row.value ?? row.response;
  if (Array.isArray(value)) {
    return value.map((item) => labeledValue(item) || String(item)).join("; ");
  }
  return labeledValue(value) || blankToNull(value);
}

export function mapAtsAnswers(
  rawInput: Record<string, unknown>,
  applicationBambooId: string
): MappedAtsAnswerWrite[] {
  const raw = dropSecretFields(rawInput);
  const lists = [
    raw.questionsAndAnswers,
    raw.questions,
    raw.answers,
    asRecord(raw.applicant).questions,
  ];
  const out: MappedAtsAnswerWrite[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const rec = dropSecretFields(asRecord(item));
      const question = questionText(rec);
      if (!question) continue;
      const questionId =
        nestedId(rec.id) ||
        nestedId(rec.questionId) ||
        blankToNull(rec.questionId) ||
        question.slice(0, 80);
      const key = `${applicationBambooId}:${questionId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        bambooQuestionId: String(questionId),
        question,
        answer: answerText(rec),
      });
    }
  }
  return out;
}

export function mapAtsComments(
  rawInput: Record<string, unknown>,
  applicationBambooId: string
): MappedAtsCommentWrite[] {
  const raw = dropSecretFields(rawInput);
  const nestedComments = asRecord(raw.comments).comments;
  const list: unknown[] = Array.isArray(raw.comments)
    ? raw.comments
    : Array.isArray(nestedComments)
      ? nestedComments
      : [];
  const out: MappedAtsCommentWrite[] = [];
  for (const item of list) {
    const rec = dropSecretFields(asRecord(item));
    const content =
      blankToNull(rec.comment) ||
      blankToNull(rec.content) ||
      blankToNull(rec.body) ||
      blankToNull(rec.text);
    if (!content) continue;
    const author = asRecord(rec.author) || asRecord(rec.user);
    const bambooId =
      nestedId(rec.id) ||
      blankToNull(rec.id) ||
      `${applicationBambooId}:${blankToNull(rec.created) || content.slice(0, 24)}`;
    out.push({
      bambooId: String(bambooId),
      authorName:
        labeledValue(rec.author) ||
        blankToNull(author.name) ||
        [blankToNull(author.firstName), blankToNull(author.lastName)]
          .filter(Boolean)
          .join(" ") ||
        null,
      authorBambooId: nestedId(author.id) || nestedId(author.employeeId),
      content,
      commentedAt:
        blankToNull(rec.created) ||
        blankToNull(rec.createdDate) ||
        blankToNull(rec.date) ||
        null,
    });
  }
  return out;
}

export function mapAtsStatusHistory(
  rawInput: Record<string, unknown>,
  applicationBambooId: string
): MappedAtsStatusHistoryWrite[] {
  const raw = dropSecretFields(rawInput);
  const list = Array.isArray(raw.statusHistory)
    ? raw.statusHistory
    : Array.isArray(raw.history)
      ? raw.history
      : [];
  const out: MappedAtsStatusHistoryWrite[] = [];
  for (const item of list) {
    const rec = dropSecretFields(asRecord(item));
    const status = rec.status ?? rec;
    const label =
      labeledValue(status) ||
      blankToNull(asRecord(status).label) ||
      blankToNull(rec.label);
    if (!label) continue;
    const statusId =
      nestedId(asRecord(status).id) ||
      blankToNull(asRecord(status).id) ||
      nestedId(rec.statusId);
    const changedAt =
      blankToNull(rec.date) ||
      blankToNull(rec.changedAt) ||
      blankToNull(rec.created) ||
      "unknown";
    const user = asRecord(rec.user) || asRecord(rec.changedBy);
    out.push({
      bambooEventId: `${applicationBambooId}:${statusId || label}:${changedAt}`,
      bambooStatusId: statusId,
      statusLabel: label,
      changedAt: changedAt === "unknown" ? null : changedAt,
      changedByName:
        labeledValue(rec.user) ||
        blankToNull(user.name) ||
        [blankToNull(user.firstName), blankToNull(user.lastName)]
          .filter(Boolean)
          .join(" ") ||
        null,
    });
  }
  return out;
}

export function emptyAtsDatasetCounts() {
  return {
    applications: 0,
    answers: 0,
    comments: 0,
    statusHistory: 0,
    resumes: 0,
  };
}
