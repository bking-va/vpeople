import { blankToNull } from "./map";
import { asRecord, labeledValue, nestedId } from "./map-extended";
import { EXCLUDED_BAMBOO_FIELDS } from "./map";

export const METADATA_EMPLOYEE_FIELDS = [
  "ethnicity",
  "eeo",
  "payGroup",
  "exempt",
  "standardHoursPerWeek",
  "timeTrackingEnabled",
] as const;

export const FORBIDDEN_BAMBOO_FIELD_PATTERN =
  /ssn|sin|national.?id|nin|passport|bank|iban|routing|swift|credit.?card|account.?number|transit|direct.?deposit/i;

export const COMP_SENSITIVE_FIELD_PATTERN =
  /pay|salary|bonus|commission|compensat|equity|stock|option|grant|wage|hourly|currency|flsa|exempt/;

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

export function isForbiddenBambooField(
  alias: string,
  name?: string | null,
  type?: string | null
): boolean {
  const haystack = `${alias} ${name ?? ""} ${type ?? ""}`;
  if (FORBIDDEN_BAMBOO_FIELD_PATTERN.test(haystack)) return true;
  if ((type ?? "").toLowerCase() === "ssn") return true;
  return EXCLUDED_FIELD_SET.has(alias);
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

export function customFieldSection(alias: string, name: string): string {
  const haystack = `${alias} ${name}`.toLowerCase();
  if (EEO_FIELD_PATTERN.test(haystack)) return "eeo";
  if (COMP_SENSITIVE_FIELD_PATTERN.test(haystack)) return "compensation";
  return "personal";
}

export function customFieldVisibility(
  alias: string,
  name: string
): MappedCustomFieldWrite["visibility"] {
  const haystack = `${alias} ${name}`.toLowerCase();
  if (EEO_FIELD_PATTERN.test(haystack)) return "hr_only";
  if (COMP_SENSITIVE_FIELD_PATTERN.test(haystack)) return "hr_only";
  return "everyone";
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
  if (isForbiddenBambooField(alias, name, type)) return null;
  return {
    bambooId: alias,
    name,
    fieldType: mapBambooCustomFieldType(type),
    entityType: "employee",
    section: customFieldSection(alias, name),
    options: optionList(raw.options ?? raw.listValues ?? raw.values),
    isRequired: parseBoolean(raw.required ?? raw.isRequired) === true,
    orderIndex: Number.parseInt(String(raw.id ?? "0"), 10) || 0,
    visibility: customFieldVisibility(alias, name),
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
  if (isForbiddenBambooField(field.bambooId, text)) return null;
  return {
    fieldBambooId: field.bambooId,
    employeeBambooId,
    value: text,
  };
}
