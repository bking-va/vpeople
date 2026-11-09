export const CANADIAN_ROE_CODES = [
  { code: "A", label: "Shortage of work / End of contract or season" },
  { code: "B", label: "Strike or lockout" },
  { code: "D", label: "Illness or injury" },
  { code: "E", label: "Quit" },
  { code: "F", label: "Maternity" },
  { code: "G", label: "Retirement" },
  { code: "H", label: "Work-Sharing" },
  { code: "J", label: "Apprentice training" },
  { code: "K", label: "Other" },
  { code: "M", label: "Dismissal" },
  { code: "N", label: "Leave of absence" },
  { code: "P", label: "Parental" },
  { code: "Z", label: "Compassionate care / Family caregiver" },
] as const;

export type CanadianRoeCode = (typeof CANADIAN_ROE_CODES)[number]["code"];

const ROE_CODE_SET = new Set<string>(CANADIAN_ROE_CODES.map((row) => row.code));

export function isCanadianRoeCode(code: string | null | undefined): code is CanadianRoeCode {
  return Boolean(code && ROE_CODE_SET.has(code));
}

export function roeLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return CANADIAN_ROE_CODES.find((row) => row.code === code)?.label ?? null;
}

export const DEFAULT_TERMINATION_REASONS = [
  {
    code: "resignation",
    name: "Resignation",
    category: "voluntary",
    roeCode: "E",
    description: "Employee resigned, including accepting another position",
  },
  {
    code: "end_of_contract",
    name: "End of contract or season",
    category: "involuntary",
    roeCode: "A",
    description: "Fixed-term contract, seasonal work, or shortage of work",
  },
  {
    code: "layoff",
    name: "Layoff / shortage of work",
    category: "involuntary",
    roeCode: "A",
    description: "Position eliminated or shortage of work",
  },
  {
    code: "dismissal",
    name: "Dismissal",
    category: "involuntary",
    roeCode: "M",
    description: "Involuntary termination / dismissed",
  },
  {
    code: "retirement",
    name: "Retirement",
    category: "retirement",
    roeCode: "G",
    description: "Employee retired",
  },
  {
    code: "illness_or_injury",
    name: "Illness or injury",
    category: "other",
    roeCode: "D",
    description: "Unable to continue employment due to illness or injury",
  },
  {
    code: "other",
    name: "Other",
    category: "other",
    roeCode: "K",
    description: "Other reason not listed",
  },
] as const;
