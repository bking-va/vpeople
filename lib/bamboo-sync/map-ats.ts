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
    addressCity:
      blankToNull(applicant.city) ||
      blankToNull(applicant.addressCity) ||
      blankToNull(raw.city),
    addressProvince:
      blankToNull(applicant.state) ||
      blankToNull(applicant.province) ||
      blankToNull(applicant.region) ||
      blankToNull(raw.state),
    addressPostalCode:
      blankToNull(applicant.zip) ||
      blankToNull(applicant.zipcode) ||
      blankToNull(applicant.postalCode) ||
      blankToNull(raw.zipcode),
    addressCountry:
      blankToNull(applicant.country) ||
      blankToNull(raw.country),
  };
}

function scalarText(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    return blankToNull(value);
  }
  return null;
}

function personName(value: unknown): string | null {
  const rec = asRecord(value);
  const fromParts = [scalarText(rec.firstName), scalarText(rec.lastName)]
    .filter(Boolean)
    .join(" ");
  return (
    fromParts ||
    scalarText(rec.name) ||
    scalarText(rec.label) ||
    labeledValue(value)
  );
}

function questionText(row: Record<string, unknown>): string | null {
  return (
    scalarText(row.question) ||
    labeledValue(row.question) ||
    scalarText(row.label) ||
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
        nestedId(asRecord(rec.question).id) ||
        nestedId(rec.questionId) ||
        scalarText(rec.questionId) ||
        nestedId(rec.id) ||
        scalarText(rec.id) ||
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

export function commentRecordsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object"
    );
  }
  const root = asRecord(payload);
  const nested = asRecord(root.comments).comments;
  const list = Array.isArray(root.comments)
    ? root.comments
    : Array.isArray(root.data)
      ? root.data
      : Array.isArray(nested)
        ? nested
        : [];
  return list.filter(
    (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object"
  );
}

export function mapAtsComments(
  rawInput: Record<string, unknown>,
  applicationBambooId: string
): MappedAtsCommentWrite[] {
  const raw = dropSecretFields(rawInput);
  const list = commentRecordsFromPayload(raw);
  const out: MappedAtsCommentWrite[] = [];
  for (const item of list) {
    const rec = dropSecretFields(asRecord(item));
    const content =
      scalarText(rec.comment) ||
      scalarText(rec.content) ||
      scalarText(rec.body) ||
      scalarText(rec.text);
    if (!content) continue;
    const author = asRecord(rec.author) || asRecord(rec.user) || asRecord(rec.createdBy);
    const bambooId =
      nestedId(rec.id) ||
      scalarText(rec.id) ||
      `${applicationBambooId}:${scalarText(rec.created) || content.slice(0, 24)}`;
    out.push({
      bambooId: String(bambooId),
      authorName: personName(rec.author) || personName(author),
      authorBambooId: nestedId(author.id) || nestedId(author.employeeId),
      content,
      commentedAt:
        scalarText(rec.created) ||
        scalarText(rec.createdDate) ||
        scalarText(rec.createdAt) ||
        scalarText(rec.date) ||
        null,
    });
  }
  return out;
}

function historyChangedAt(rec: Record<string, unknown>, statusRec: Record<string, unknown>): string | null {
  return (
    scalarText(rec.dateChanged) ||
    scalarText(statusRec.dateChanged) ||
    scalarText(rec.date) ||
    scalarText(rec.changedAt) ||
    scalarText(rec.created) ||
    scalarText(rec.appliedDate) ||
    null
  );
}

function pushStatusHistoryEvent(
  out: MappedAtsStatusHistoryWrite[],
  seen: Set<string>,
  applicationBambooId: string,
  rec: Record<string, unknown>
) {
  const status = rec.status && typeof rec.status === "object" ? rec.status : rec;
  const statusRec = asRecord(status);
  const label =
    labeledValue(status) ||
    scalarText(statusRec.label) ||
    scalarText(rec.label) ||
    scalarText(rec.statusLabel);
  if (!label) return;
  const statusId =
    nestedId(statusRec.id) ||
    scalarText(statusRec.id) ||
    nestedId(rec.statusId) ||
    scalarText(rec.statusId);
  const changedAt = historyChangedAt(rec, statusRec);
  const eventKey = `${applicationBambooId}:${statusId || label}:${changedAt || "unknown"}`;
  if (seen.has(eventKey)) return;
  seen.add(eventKey);
  const user =
    rec.changedByUser ??
    rec.user ??
    rec.changedBy ??
    statusRec.changedByUser ??
    statusRec.user;
  out.push({
    bambooEventId: eventKey,
    bambooStatusId: statusId,
    statusLabel: label,
    changedAt,
    changedByName: personName(user),
  });
}

export function mapAtsStatusHistory(
  rawInput: Record<string, unknown>,
  applicationBambooId: string
): MappedAtsStatusHistoryWrite[] {
  const raw = dropSecretFields(rawInput);
  const out: MappedAtsStatusHistoryWrite[] = [];
  const seen = new Set<string>();
  const lists = [raw.statusHistory, raw.history];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      pushStatusHistoryEvent(out, seen, applicationBambooId, dropSecretFields(asRecord(item)));
    }
  }
  if (raw.status && typeof raw.status === "object") {
    const statusRec = dropSecretFields(asRecord(raw.status));
    const statusId = nestedId(statusRec.id) || scalarText(statusRec.id);
    const changedAt = historyChangedAt(statusRec, statusRec);
    const alreadyRecorded = out.some((event) => {
      if (!statusId || event.bambooStatusId !== statusId) return false;
      if (!changedAt) return true;
      return event.changedAt === changedAt;
    });
    if (!alreadyRecorded) {
      pushStatusHistoryEvent(out, seen, applicationBambooId, statusRec);
    }
  }
  const appliedDate = scalarText(raw.appliedDate) || scalarText(raw.applied);
  if (appliedDate && !out.some((event) => event.changedAt === appliedDate)) {
    pushStatusHistoryEvent(out, seen, applicationBambooId, {
      statusLabel: "Applied",
      dateChanged: appliedDate,
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
