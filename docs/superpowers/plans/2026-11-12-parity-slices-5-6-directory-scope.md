# Slices 5 + 6 + directory RSC scope

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hired-candidate prefill into the existing employee wizard (no auto-provision), HR time-off balance ledger + holiday CRUD with holiday-excluded request days, and people-directory RSCs using the same `scopedEmployeeIds` as the API.

**Architecture:** Additive `candidates.employee_id`. Reuse `POST /api/employees/create`, `time_off_balance_adjustments`, and company-wide `holidays`. Directory pages drop the `regional_view`-only scope bypass.

**Tech Stack:** Drizzle additive migration **0028**, Jest unit + integration.

## Global Constraints

- Do not auto-create employees on `stage=hired`
- Do not insert `users` / provision login
- Do not copy offer salary
- Public careers DTO unchanged
- Holidays remain company-wide
- Actor for adjustments and holiday writes: `full_admin` or `canManageUsers`; adjustment target in `scopedEmployeeIds`
- Do not migrate production; do not rewrite 0027
- Preserve personal vs `@vendasta.com` email rules

## File Map

- Modify: `lib/db/schema.ts` — `candidates.employeeId`
- Create: `drizzle/0028_parity_second_round.sql` + journal/snapshot via `npx drizzle-kit generate`, then additive SQL
- Modify: `app/(dashboard)/people/page.tsx`, `directory/page.tsx`, `[id]/page.tsx` — always `scopedEmployeeIds`
- Create: `lib/hire-employee.ts` — safe prefill, create-from-candidate gates
- Modify: `app/api/employees/create/route.ts`, `app/(dashboard)/people/new/page.tsx`, `components/new-employee-wizard.tsx`
- Modify: `app/(dashboard)/hiring/candidates/[id]/page.tsx` — Create employee button when hired and unlinked
- Modify: `lib/calendar-days.ts` — exclude holiday dates
- Modify: `lib/time-off-adjustments.ts` — manual ledger write
- Create: `app/api/time-off/adjustments/route.ts`, `app/api/holidays/route.ts`, `app/api/holidays/[id]/route.ts`
- Modify: time-off request + Bamboo create routes to use holiday-aware day count
- Modify: `/time-off/holidays` CRUD UI; `/time-off/balances` adjustment form
- Tests: unit helpers + integration for hire, adjustments, holidays, directory source contract
- Modify: `docs/PARITY.md`, `README.md`, `API.md`, `PRODUCTION_STATUS.md`

---

## Task 1: Directory RSC fail-closed

**Files:** people pages, `__tests__/api/people-directory-scope.test.ts`

- [x] **Step 1: RED** — pages must not contain `regional_view` ? scope : `"all"`. Helper/unit: employee/manager `canSeeAllEmployees` is false.
- [x] **Step 2: GREEN** — `/people`, `/people/directory`, `/people/[id]` always call `scopedEmployeeIds`. Missing actor → empty set / notFound.

---

## Task 2: Hire prefill (no auto-provision)

- [x] **Step 1: RED** — `safeHirePrefill` never includes salary/resume; unit tests for fields. Integration: PATCH hired does not insert employees; POST create with candidateId as hiring lead links + audits; outsider 403; already-linked 409; no `users` row.
- [x] **Step 2: GREEN** — migration 0028 `employee_id`; create route + wizard prefill + candidate CTA.
- [x] **Step 3:** `npm test -- __tests__/api/hire-employee.test.ts` and integration file.

---

## Task 3: Time-off ops

- [x] **Step 1: RED** — `requestDaysExcludingHolidays` drops holiday dates (including recurring month-day). Adjustment helper records ledger. Integration: HR in-scope adjust; employee 403; out-of-scope 403; holiday on range reduces `daysRequested`; employee cannot POST holidays.
- [x] **Step 2: GREEN** — APIs + UI. Session and Bamboo create use the helper.
- [x] **Step 3:** `npm test` + `npm run test:integration` after `db:migrate` on local test DB.

## Pass commands

```bash
npm test
npm run db:migrate   # local/test DATABASE_URL only
npm run test:integration
npm run db:check
```

Do **not** run `db:migrate` against production.
