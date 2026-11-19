import { blankToNull } from "./map";
import { asRecord, labeledValue, nestedId } from "./map-extended";
import {
  EXCLUDED_BAMBOO_FIELDS,
  IMPORTED_EMPLOYEE_FIELDS,
  UNMAPPED_KNOWN_BAMBOO_FIELDS,
} from "./map";

export const METADATA_EMPLOYEE_FIELDS = [
  "ethnicity",
  "eeo",
  "payGroup",
  "exempt",
  "standardHoursPerWeek",
  "timeTrackingEnabled",
] as const;

const FORBIDDEN_FIELD_TOKENS = new Set([
  "ssn",
  "sin",
  "nin",
  "nino",
  "iban",
  "routing",
  "swift",
  "bank",
  "passport",
  "transit",
  "tin",
  "itin",
  "nid",
]);

const FORBIDDEN_FIELD_PHRASES = [
  "national id",
  "national identifier",
  "national identification",
  "social insurance",
  "social security",
  "tax id",
  "tax identification",
  "national insurance",
  "credit card",
  "account number",
  "direct deposit",
];

const STANDARD_BAMBOO_FIELD_ALIASES = new Set<string>([
  ...IMPORTED_EMPLOYEE_FIELDS,
  ...UNMAPPED_KNOWN_BAMBOO_FIELDS,
]);

export function fieldNameTokens(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export const COMP_SENSITIVE_FIELD_PATTERN =
  /pay|salary|bonus|commission|compensat|equity|stock|option|grant|wage|hourly|currency|flsa|exempt|\bote\b|\bctc\b|on target|target earnings|total cash/;

const CURRENCY_BAMBOO_TYPES = new Set([
  "currency",
  "money",
  "usd",
  "cad",
  "monetary",
]);

export const EEO_FIELD_PATTERN = /ethnicity|eeo|race|hispanic|veteran|disability/;

const EXCLUDED_FIELD_SET = new Set<string>(EXCLUDED_BAMBOO_FIELDS);

export type MappedEmployeeExtrasWrite = {
  bambooId: string;
  ethnicity: string | null;
  eeoJobCategory: string | null;
  payGroup: string | null;
  flsaExempt: boolean | null;
  standardHoursPerWeek: string | null;
  timeTrackingEnabled: boolean | null;
};

export type MappedAssetWrite = {
  bambooId: string;
  employeeBambooId: string;
  name: string;
  category: string | null;
  serialNumber: string | null;
  assignedDate: string | null;
  notes: string | null;
};

export type MappedDependentWrite = {
  bambooId: string;
  employeeBambooId: string;
  firstName: string;
  lastName: string | null;
  relationship: string | null;
  birthDate: string | null;
};

export type MappedCustomFieldWrite = {
  bambooId: string;
  name: string;
  fieldType: "text" | "number" | "date" | "select" | "textarea" | "checkbox";
  entityType: string;
  section: string;
  options: string | null;
  isRequired: boolean;
  orderIndex: number;
  visibility: "everyone" | "manager_hr" | "hr_only";
};

export type MappedCustomFieldValueWrite = {
  fieldBambooId: string;
  employeeBambooId: string;
  value: string | null;
};

export type MetadataDatasetCounts = {
  assets: number;
  dependents: number;
  customFields: number;
  customFieldValues: number;
  employeeExtras: number;
};

export function emptyMetadataCounts(): MetadataDatasetCounts {
  return {
    assets: 0,
    dependents: 0,
    customFields: 0,
    customFieldValues: 0,
    employeeExtras: 0,
  };
}

export function isPrivateEmailBambooField(
  alias: string,
  name?: string | null,
  type?: string | null
): boolean {
  const haystack = `${alias} ${name ?? ""}`.toLowerCase();
  if (
    ["homeemail", "personalemail", "privateemail", "bestemail"].includes(
      alias.toLowerCase()
    )
  ) {
    return true;
  }
  if (/(home|personal|private|best)\s*e-?mails?/.test(haystack)) return true;
  const fieldType = (type ?? "").toLowerCase();
  return fieldType === "email" && !/work/.test(haystack);
}

export function isCurrencyBambooType(type?: string | null): boolean {
  return CURRENCY_BAMBOO_TYPES.has((type ?? "").toLowerCase());
}

export function isForbiddenBambooField(
  alias: string,
  name?: string | null,
  type?: string | null
): boolean {
  if (EXCLUDED_FIELD_SET.has(alias)) return true;
  if (isPrivateEmailBambooField(alias, name, type)) return true;
  if ((type ?? "").toLowerCase() === "ssn") return true;
  const tokens = fieldNameTokens(`${alias} ${name ?? ""} ${type ?? ""}`);
  if (tokens.some((token) => FORBIDDEN_FIELD_TOKENS.has(token))) return true;
  const joined = tokens.join(" ");
  return FORBIDDEN_FIELD_PHRASES.some((phrase) => joined.includes(phrase));
}

export function isStandardBambooEmployeeField(alias: string): boolean {
  return STANDARD_BAMBOO_FIELD_ALIASES.has(alias);
}

export function mapBambooCustomFieldType(
  type: string | null | undefined
): MappedCustomFieldWrite["fieldType"] {
  const key = (type ?? "text").toLowerCase();
  if (key === "checkbox" || key === "bool" || key === "boolean") return "checkbox";
  if (key === "date" || key === "timestamp") return "date";
  if (
    key === "int" ||
    key === "integer" ||
    key === "number" ||
    key === "currency" ||
    key === "decimal" ||
    key === "percent" ||
    key === "float"
  ) {
    return "number";
  }
  if (key === "list" || key === "dropdown" || key === "options" || key === "enum") {
    return "select";
  }
  if (key === "textarea" || key === "richtext" || key === "multiline") return "textarea";
  return "text";
}

export function customFieldSection(
  alias: string,
  name: string,
  type?: string | null
): string {
  const haystack = `${alias} ${name}`.toLowerCase();
  if (EEO_FIELD_PATTERN.test(haystack)) return "eeo";
  if (isCurrencyBambooType(type) || COMP_SENSITIVE_FIELD_PATTERN.test(haystack)) {
    return "compensation";
  }
  return "personal";
}

export function customFieldVisibility(
  _alias?: string,
  _name?: string,
  _type?: string | null
): MappedCustomFieldWrite["visibility"] {
  // Imported Bamboo fields are HR-only until an admin tightens or loosens locally.
  // Sync does not overwrite visibility, so a local hr_only restriction sticks.
  return "hr_only";
}

function parseBoolean(value: unknown): boolean | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value;
  const key = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "exempt"].includes(key)) return true;
  if (["0", "false", "no", "n", "non-exempt", "nonexempt"].includes(key)) {
    return false;
  }
  return null;
}

function dropExcludedFields(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isForbiddenBambooField(key)) continue;
    next[key] = value;
  }
  return next;
}

export function mapEmployeeExtras(
  raw: Record<string, unknown>
): MappedEmployeeExtrasWrite | null {
  const bambooId = nestedId(raw.id) || blankToNull(raw.id);
  if (!bambooId) return null;
  const ethnicity = labeledValue(raw.ethnicity);
  const eeoJobCategory =
    labeledValue(raw.eeo) || labeledValue(raw.eeoJobCategory);
  const payGroup = labeledValue(raw.payGroup);
  const flsaExempt = parseBoolean(raw.exempt ?? raw.flsaExempt);
  const standardHoursPerWeek = blankToNull(raw.standardHoursPerWeek);
  const timeTrackingEnabled = parseBoolean(raw.timeTrackingEnabled);
  if (
    !ethnicity &&
    !eeoJobCategory &&
    !payGroup &&
    flsaExempt == null &&
    !standardHoursPerWeek &&
    timeTrackingEnabled == null
  ) {
    return null;
  }
  return {
    bambooId,
    ethnicity,
    eeoJobCategory,
    payGroup,
    flsaExempt,
    standardHoursPerWeek,
    timeTrackingEnabled,
  };
}

export function mapAssetRow(
  rawInput: Record<string, unknown>,
  employeeBambooId: string
): MappedAssetWrite | null {
  const raw = dropExcludedFields(rawInput);
  const rowId = nestedId(raw.id) || blankToNull(raw.id);
  const name =
    labeledValue(raw.asset) ||
    labeledValue(raw.name) ||
    labeledValue(raw.description) ||
    labeledValue(raw.category) ||
    "Asset";
  if (!employeeBambooId || !name) return null;
  const bambooId = rowId
    ? `asset:${employeeBambooId}:${rowId}`
    : `asset:${employeeBambooId}:${name}`;
  return {
    bambooId,
    employeeBambooId,
    name,
    category: labeledValue(raw.category) || labeledValue(raw.assetCategory),
    serialNumber:
      blankToNull(raw.serialNumber) ||
      blankToNull(raw.serial) ||
      blankToNull(raw.assetSerialNumber),
    assignedDate:
      blankToNull(raw.dateLoaned) ||
      blankToNull(raw.assignedDate) ||
      blankToNull(raw.loanDate) ||
      blankToNull(raw.startDate),
    notes: blankToNull(raw.notes) || blankToNull(raw.comment),
  };
}

export function mapDependentRow(
  rawInput: Record<string, unknown>,
  employeeBambooId: string
): MappedDependentWrite | null {
  const raw = dropExcludedFields(rawInput);
  const rowId = nestedId(raw.id) || blankToNull(raw.id);
  const firstName =
    blankToNull(raw.firstName) ||
    blankToNull(raw.name) ||
    labeledValue(raw.dependent);
  if (!employeeBambooId || !firstName || !rowId) return null;
  return {
    bambooId: `dep:${employeeBambooId}:${rowId}`,
    employeeBambooId,
    firstName,
    lastName: blankToNull(raw.lastName),
    relationship: labeledValue(raw.relationship) || labeledValue(raw.relation),
    birthDate:
      blankToNull(raw.dateOfBirth) ||
      blankToNull(raw.birthDate) ||
      blankToNull(raw.dob),
  };
}

function optionList(value: unknown): string | null {
  if (Array.isArray(value)) {
    const labels = value
      .map((item) => labeledValue(item) || blankToNull(item))
      .filter((item): item is string => Boolean(item));
    return labels.length > 0 ? JSON.stringify(labels) : null;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return JSON.stringify(parsed);
    } catch {
      return JSON.stringify(
        value.split(",").map((item) => item.trim()).filter(Boolean)
      );
    }
  }
  return null;
}

export function mapMetaField(rawInput: unknown): MappedCustomFieldWrite | null {
  const raw = asRecord(rawInput);
  const alias =
    blankToNull(raw.alias) ||
    blankToNull(raw.name) ||
    nestedId(raw.id) ||
    blankToNull(raw.id);
  const name = labeledValue(raw.name) || alias;
  const type = blankToNull(raw.type);
  if (!alias || !name) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(alias)) return null;
  if (isStandardBambooEmployeeField(alias)) return null;
  if (isForbiddenBambooField(alias, name, type)) return null;
  return {
    bambooId: alias,
    name,
    fieldType: mapBambooCustomFieldType(type),
    entityType: "employee",
    section: customFieldSection(alias, name, type),
    options: optionList(raw.options ?? raw.listValues ?? raw.values),
    isRequired: parseBoolean(raw.required ?? raw.isRequired) === true,
    orderIndex: Number.parseInt(String(raw.id ?? "0"), 10) || 0,
    visibility: customFieldVisibility(alias, name, type),
  };
}

export function mapCustomFieldValue(
  raw: Record<string, unknown>,
  field: MappedCustomFieldWrite
): MappedCustomFieldValueWrite | null {
  const employeeBambooId = nestedId(raw.id) || blankToNull(raw.id);
  if (!employeeBambooId) return null;
  const value = raw[field.bambooId];
  if (value == null || value === "") return null;
  const text = labeledValue(value) || blankToNull(value);
  if (!text) return null;
  if (isForbiddenBambooField(field.bambooId, field.name)) return null;
  if (/^\d{3}-\d{2}-\d{4}$/.test(text.trim())) return null;
  return {
    fieldBambooId: field.bambooId,
    employeeBambooId,
    value: text,
  };
}
