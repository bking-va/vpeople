import { asRecord, labeledValue, nestedId } from "./map-extended";
import { blankToNull } from "./map";
import { randomBytes } from "crypto";

export const RESTRICTED_BAMBOO_FILE_CATEGORIES = [
  "i-9",
  "i9",
  "immigration",
  "signed documents",
  "signed document",
  "commission docs",
  "commission",
  "stock option",
  "stock options",
  "sunlife",
  "sun life",
  "resumes",
  "resume",
  "india team",
  "compensation letter",
  "compensation letters",
] as const;

export type DocumentCategory =
  | "contract"
  | "tax_form"
  | "benefits"
  | "performance"
  | "policy"
  | "other"
  | "letter";

export type MappedBambooFile = {
  bambooId: string;
  fileId: string;
  title: string;
  bambooCategory: string | null;
  category: DocumentCategory;
  restricted: boolean;
  containsCompensation: boolean;
};

const SAFE_NAME = /[^A-Za-z0-9._-]+/g;

export function isRestrictedBambooFileCategory(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase().replace(/[_-]+/g, " ").trim();
  const compact = normalized.replace(/\s+/g, "");
  return RESTRICTED_BAMBOO_FILE_CATEGORIES.some((entry) => {
    const needle = entry.replace(/[_-]+/g, " ").trim();
    return (
      normalized.includes(needle) || compact.includes(needle.replace(/\s+/g, ""))
    );
  });
}

export function isCompensationFileCategory(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return (
    normalized.includes("commission") ||
    normalized.includes("stock option") ||
    normalized.includes("compensation")
  );
}

export function mapDocumentCategory(value: string | null | undefined): DocumentCategory {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("i-9") || normalized.includes("tax") || normalized.includes("w-2") || normalized.includes("t4")) {
    return "tax_form";
  }
  if (normalized.includes("benefit") || normalized.includes("sunlife") || normalized.includes("sun life")) {
    return "benefits";
  }
  if (normalized.includes("performance") || normalized.includes("review")) return "performance";
  if (normalized.includes("policy") || normalized.includes("handbook")) return "policy";
  if (normalized.includes("letter") || normalized.includes("offer") || normalized.includes("contract")) {
    return "letter";
  }
  if (normalized.includes("signed") || normalized.includes("agreement")) return "contract";
  return "other";
}

function shareWithEmployeesValue(rec: Record<string, unknown>): unknown {
  return rec.shareWithEmployees ?? rec.sharedWithEmployees ?? rec.shareWithEmployee;
}

/** Bamboo company files are employee-visible only when explicitly shared. */
export function isExplicitlySharedWithEmployees(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "yes" || normalized === "true" || normalized === "y" || normalized === "1";
}

export function mapFileFromCategory(
  file: Record<string, unknown>,
  categoryName: string | null,
  kind: "employee" | "company",
  employeeBambooId?: string,
  categoryShareWithEmployees?: unknown
): MappedBambooFile | null {
  const rec = asRecord(file);
  const fileId = nestedId(rec.id) || blankToNull(rec.id);
  if (!fileId) return null;
  const title =
    labeledValue(rec.name) ||
    labeledValue(rec.originalFileName) ||
    labeledValue(rec.filename) ||
    `file-${fileId}`;
  const bambooCategory = categoryName || labeledValue(rec.category);
  const bambooId =
    kind === "employee"
      ? `emp:${employeeBambooId || "unknown"}:${fileId}`
      : `company:${fileId}`;
  const heuristicRestricted =
    isRestrictedBambooFileCategory(bambooCategory) || isRestrictedBambooFileCategory(title);
  const sharedWithEmployees = isExplicitlySharedWithEmployees(
    shareWithEmployeesValue(rec) ?? categoryShareWithEmployees
  );
  return {
    bambooId,
    fileId,
    title,
    bambooCategory,
    category: mapDocumentCategory(bambooCategory || title),
    restricted:
      heuristicRestricted || (kind === "company" && !sharedWithEmployees),
    containsCompensation:
      isCompensationFileCategory(bambooCategory) || isCompensationFileCategory(title),
  };
}

export function filesFromViewPayload(
  payload: unknown,
  kind: "employee" | "company",
  employeeBambooId?: string
): MappedBambooFile[] {
  const root = asRecord(payload);
  const categories = Array.isArray(root.categories)
    ? root.categories
    : Array.isArray(payload)
      ? payload
      : [];
  const out: MappedBambooFile[] = [];
  for (const category of categories) {
    const rec = asRecord(category);
    const name = labeledValue(rec.name) || labeledValue(rec.category) || blankToNull(rec.name);
    const categoryShare = shareWithEmployeesValue(rec);
    const files = Array.isArray(rec.files) ? rec.files : Array.isArray(rec.documents) ? rec.documents : [];
    for (const file of files) {
      const mapped = mapFileFromCategory(
        asRecord(file),
        name,
        kind,
        employeeBambooId,
        categoryShare
      );
      if (mapped) out.push(mapped);
    }
  }
  const loose = Array.isArray(root.files) ? root.files : [];
  for (const file of loose) {
    const mapped = mapFileFromCategory(asRecord(file), null, kind, employeeBambooId);
    if (mapped) out.push(mapped);
  }
  return out;
}

export function bambooFileBlobPath(kind: "employee" | "company", bambooId: string, filename: string): string {
  const id = bambooId.replace(SAFE_NAME, "").slice(0, 80) || "unknown";
  const base = filename.replace(SAFE_NAME, "-").replace(/^\.+/, "").slice(0, 80) || "file";
  const nonce = randomBytes(12).toString("hex");
  return `bamboo-files/${kind}/${id}/${nonce}-${base}`;
}
