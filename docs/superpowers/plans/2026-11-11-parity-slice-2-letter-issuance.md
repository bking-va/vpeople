# Slice 2: Letter issuance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Issue an existing letter template to an in-scope employee as a `pending_signature` document, with compensation-gated `payRate`, merge-field validation, and an audit row. No India legal copy.

**Architecture:** Server derives merge values from the employee (and latest compensation row). `POST /api/letter-templates/[id]/issue` writes `documents` with `body`, `letterTemplateId`, `status=pending_signature`. Existing sign route remains the signature step.

**Tech Stack:** Drizzle additive columns on `documents` in **0027**, Jest.

## Global Constraints

- Do not invent India templates
- `payRate` omitted without `canViewCompensation`
- Target must be in `scopedEmployeeIds`
- Actor: `full_admin` or `canManageUsers` (not session role `admin` alone)
- No Blob; store merged text in `documents.body`
- No production migrate/seed

## File Map

- Modify: `lib/db/schema.ts` — `documents.body`, `documents.letterTemplateId`; enum `letter`
- Modify: drizzle **0027** (shared with slice 4)
- Create: `lib/letter-issue.ts` — build merge values, reject extra keys, issue
- Create: `app/api/letter-templates/[id]/issue/route.ts`
- Modify: `app/(dashboard)/settings/letter-templates/page.tsx` — issue form
- Create: `components/letter-issue-form.tsx`
- Modify: `components/profile-documents.tsx` — show `body` / sign without `fileUrl`
- Modify: `app/(dashboard)/people/[id]/page.tsx` if document select needs `body`
- Create: `__tests__/api/letter-issue.test.ts`
- Create: `__tests__/integration/letter-issue.integration.test.ts`

---

## Task 1: Merge builder (unit)

- [ ] **Step 1: RED** — `buildLetterMergeValues` fills `firstName` etc.; `payRate` present only when `includePayRate`; extra client keys rejected by `assertNoClientMergeOverrides({})` / 400 helper.
- [ ] **Step 2: GREEN** — implement in `lib/letter-issue.ts` using `LETTER_MERGE_FIELDS`. Latest `compensationHistory` by `effectiveDate` desc for payRate.
- [ ] **Step 3:** `npm test -- __tests__/api/letter-issue.test.ts`

---

## Task 2: Issue API + document flow

- [ ] **Step 1: RED** — integration: HR issues offer template to employee in scope → document `pending_signature`, body contains first name, no payRate if HR fixture lacks `canViewCompensation` unless we use full_admin with compensation; employee outsider 403; out-of-scope 403; owner POST sign → `signed` + audit `letter_issued` exists.
- [ ] **Step 2: GREEN** — POST route: auth, permissions, scope, insert document, insert audit `letter_issued`.
- [ ] **Step 3:** Settings UI: pick employee, submit to issue endpoint.

---

## Pass commands

```bash
npm test -- __tests__/api/letter-issue.test.ts
npm run test:integration -- __tests__/integration/letter-issue.integration.test.ts
```
