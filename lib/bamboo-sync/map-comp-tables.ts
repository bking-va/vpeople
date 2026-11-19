import { blankToNull } from "./map";
import { nestedId } from "./map-extended";
import { isForbiddenBambooField } from "./map-metadata";

export const BAMBOO_COMPENSATION_TABLES = [
  { alias: "customTeamInformation", label: "Team information" },
  { alias: "customAdjustments", label: "Adjustments" },
  { alias: "customVariablePayActuals", label: "Variable pay actuals" },
  { alias: "customInternalReporting", label: "Internal reporting" },
  { alias: "customAnnualBonus", label: "Annual bonus" },
  { alias: "customShiftTiming", label: "Shift timing" },
  { alias: "customCommissionPlanDetails", label: "Commission plan details" },
  { alias: "customStatutoryBonusPlanDetails", label: "Statutory bonus plan details" },
  { alias: "customCommissionSupplements", label: "Commission supplements" },
] as const;

export type BambooCompensationTableAlias =
  (typeof BAMBOO_COMPENSATION_TABLES)[number]["alias"];

export type MappedCompensationTableRowWrite = {
  bambooId: string;
  employeeBambooId: string;
  tableAlias: BambooCompensationTableAlias;
  rowData: Record<string, unknown>;
};

export function compensationTableLabel(alias: string): string {
  return (
    BAMBOO_COMPENSATION_TABLES.find((table) => table.alias === alias)?.label ??
    alias
  );
}

export function isVisibleCompensationTableField(key: string): boolean {
  if (key === "id" || key === "employeeId") return false;
  return !isForbiddenBambooField(key);
}

export function stripForbiddenCompFields(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isForbiddenBambooField(key)) continue;
    if (typeof value === "string" && /^\d{3}-\d{2}-\d{4}$/.test(value.trim())) {
      continue;
    }
    next[key] = value;
  }
  return next;
}

export function mapCompensationTableRow(
  rawInput: Record<string, unknown>,
  employeeBambooId: string,
  tableAlias: BambooCompensationTableAlias
): MappedCompensationTableRowWrite | null {
  if (!employeeBambooId) return null;
  const rowData = stripForbiddenCompFields(rawInput);
  const rowId =
    nestedId(rowData.id) ||
    blankToNull(rowData.id) ||
    nestedId(rawInput.id) ||
    blankToNull(rawInput.id);
  if (!rowId) return null;
  delete rowData.ssn;
  delete rowData.sin;
  return {
    bambooId: `ct:${tableAlias}:${employeeBambooId}:${rowId}`,
    employeeBambooId,
    tableAlias,
    rowData,
  };
}
