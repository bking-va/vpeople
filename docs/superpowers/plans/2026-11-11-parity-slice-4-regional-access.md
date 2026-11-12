# Slice 4: Regional access v1 + iCal scope

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `regional_view` sees only self plus employees in explicitly assigned location/country allowlists (fail closed). `full_admin` and HR stay org-wide. iCal token feeds use the same employee scope.

**Architecture:** New `employee_access_scopes` rows owned by HR/full_admin. `scopedEmployeeIds` stops treating `regional_view` as global. Token calendar routes resolve the token owner as the viewer.

**Tech Stack:** Drizzle additive migration **0027** (shared with slice 2 if both land in one PR; if generating separately, keep a single 0027 file with both additive changes). Jest unit + integration.

## Global Constraints

- Fail closed: zero scopes ⇒ self only for `regional_view`
- Never infer global from empty allowlist
- Never region-scope or lock out `full_admin` (PUT scopes for full_admin → 400)
- `canManageUsers` and `global_view` remain org-wide
- Do not migrate production; do not seed/reset production
- Preserve personal vs `@vendasta.com` email rules

## File Map

- Modify: `lib/db/schema.ts` — `employeeAccessScopes`; documents letter columns if 0027 is shared
- Create: `drizzle/0027_*.sql` + journal/snapshot via `npx drizzle-kit generate`, then add `IF NOT EXISTS`
- Modify: `lib/employee-scope.ts`
- Create: `lib/access-scopes.ts` — load/replace scopes, match location/country
- Create: `app/api/settings/access-scopes/route.ts`
- Create: `app/(dashboard)/settings/access-scopes/page.tsx` + small client form
- Modify: `app/api/employees/route.ts` — filter with `scopedEmployeeIds`
- Modify: `app/api/calendar/[token]/time-off/route.ts`
- Modify: `app/api/calendar/[token]/celebrations/route.ts`
- Modify: `lib/seed.ts` — insert `regional_view` and `global_view` permission rows (`onConflictDoNothing` only; no auto regions)
- Create: `__tests__/api/employee-scope-regional.test.ts`
- Modify: `__tests__/integration/security-authz.integration.test.ts` or new `__tests__/integration/regional-access.integration.test.ts`
- Modify: `__tests__/api/auth-guard.test.ts` — scopes API 401

---

## Task 1: Scope helper (no DB)

**Files:** `__tests__/api/employee-scope-regional.test.ts`, `lib/employee-scope.ts`, `lib/access-scopes.ts`

- [ ] **Step 1: RED** — `canSeeAllEmployees` is false for `regional_view`, true for `full_admin`, `canManageUsers`, `global_view`. `employeeMatchesScope({ locationId, country }, scopes)` matches location id OR case-insensitive country; empty scopes match nobody else.
- [ ] **Step 2: GREEN** — implement matching helpers; change `canSeeAllEmployees` to drop `isViewingAccessLevel`.
- [ ] **Step 3:** `npm test -- __tests__/api/employee-scope-regional.test.ts`

---

## Task 2: Migration + scopedEmployeeIds

- [ ] **Step 1:** Add table to schema. Generate **0027**. Make SQL additive (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` for letter columns if combined).
- [ ] **Step 2: RED** — integration: regional viewer, no rows, directory/report/API/iCal does not include other-country employee.
- [ ] **Step 3: GREEN** — `scopedEmployeeIds` loads scopes for `regional_view` and unions matching employee ids + self. Calendar routes: load token employee, `getUserPermissions`, `scopedEmployeeIds`, filter events.
- [ ] **Step 4:** Filter `GET /api/employees` with the same helper.

Document in the PR: **0027** is additive; apply only on test/preview.

---

## Task 3: Settings API + UI

- [ ] **Step 1: RED** — PUT as employee 403; PUT for full_admin target 400; PUT as full_admin with location+country then GET returns them; regional viewer with those scopes sees that location only.
- [ ] **Step 2: GREEN** — GET/PUT `/api/settings/access-scopes?employeeId=`. Auth: session + (`full_admin` or `canManageUsers`). Replace rows in a transaction.
- [ ] **Step 3:** Minimal settings page listing `regional_view` employees and their scopes.

---

## Pass commands

```bash
npm test -- __tests__/api/employee-scope-regional.test.ts __tests__/api/auth-guard.test.ts
npm run test:integration -- __tests__/integration/regional-access.integration.test.ts
npm run db:check
```

Do **not** run `db:migrate` against production. Integration CI migrates the job Postgres.
