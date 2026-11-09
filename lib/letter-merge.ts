export const LETTER_MERGE_FIELDS = [
  "firstName",
  "lastName",
  "preferredName",
  "displayName",
  "jobTitle",
  "department",
  "location",
  "hireDate",
  "originalHireDate",
  "effectiveDate",
  "payRate",
  "managerName",
  "employeeNumber",
  "companyName",
] as const;

export type LetterMergeField = (typeof LETTER_MERGE_FIELDS)[number];

export function applyMergeFields(
  template: string,
  values: Partial<Record<LetterMergeField, string | number | null | undefined>>
): string {
  return template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, key: string) => {
    if (!LETTER_MERGE_FIELDS.includes(key as LetterMergeField)) return match;
    const value = values[key as LetterMergeField];
    if (value === null || value === undefined || value === "") return "";
    return String(value);
  });
}

export const SEEDED_LETTER_TEMPLATES = [
  {
    slug: "offer",
    name: "Offer letter",
    category: "offer",
    subject: "Offer of employment — {{jobTitle}}",
    body: `Dear {{firstName}} {{lastName}},

We are pleased to offer you the position of {{jobTitle}} at {{companyName}}.

Start date: {{hireDate}}
Employee number: {{employeeNumber}}
Location: {{location}}
Department: {{department}}
Compensation: {{payRate}}
Reports to: {{managerName}}

Please sign this letter to confirm your acceptance.

Sincerely,
{{companyName}} People Operations`,
    requiresSignature: true,
  },
  {
    slug: "merit-increase",
    name: "Merit / increase letter",
    category: "merit",
    subject: "Compensation increase effective {{effectiveDate}}",
    body: `Dear {{firstName}},

Congratulations. Effective {{effectiveDate}}, your compensation as {{jobTitle}} will be {{payRate}}.

Thank you for your contributions to {{companyName}}.

Sincerely,
{{managerName}}`,
    requiresSignature: true,
  },
  {
    slug: "promotion",
    name: "Promotion letter",
    category: "promotion",
    subject: "Promotion to {{jobTitle}}",
    body: `Dear {{firstName}},

We are pleased to confirm your promotion to {{jobTitle}} in {{department}}, effective {{effectiveDate}}.

Your new compensation is {{payRate}}. Please sign to acknowledge this change.

Sincerely,
{{companyName}}`,
    requiresSignature: true,
  },
  {
    slug: "title-change",
    name: "Title change letter",
    category: "title_change",
    subject: "Job title change — {{jobTitle}}",
    body: `Dear {{firstName}} {{lastName}},

Your job title is changing to {{jobTitle}} effective {{effectiveDate}}. Your department ({{department}}) and reporting line to {{managerName}} are otherwise unchanged unless noted separately.

Sincerely,
{{companyName}} People Operations`,
    requiresSignature: true,
  },
  {
    slug: "commission",
    name: "Commission letter",
    category: "commission",
    subject: "Commission plan — {{jobTitle}}",
    body: `Dear {{firstName}},

This letter confirms your commission eligibility as {{jobTitle}} in {{department}}, effective {{effectiveDate}}.

Base compensation: {{payRate}}
Company: {{companyName}}

Please sign to acknowledge the plan.

Sincerely,
{{managerName}}`,
    requiresSignature: true,
  },
  {
    slug: "termination",
    name: "Termination letter",
    category: "termination",
    subject: "Employment end date {{effectiveDate}}",
    body: `Dear {{firstName}} {{lastName}},

This letter confirms that your employment with {{companyName}} as {{jobTitle}} will end on {{effectiveDate}}.

Employee number: {{employeeNumber}}
Original hire date: {{originalHireDate}}

Please sign to acknowledge receipt.

Sincerely,
{{companyName}} People Operations`,
    requiresSignature: true,
  },
] as const;
