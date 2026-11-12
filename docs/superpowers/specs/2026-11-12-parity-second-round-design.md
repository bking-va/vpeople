# vPeople parity second round (slices 5 + 6 + directory RSC scope)

**Date:** 2026-11-12
**Status:** Approved for implementation (Approach B continuation)
**Base:** `main` at `dfa5ef2f26069303e80a670201a97cc181953c86` (PR #7 merged)
**Does not claim:** full BambooHR parity

## Goal

Ship the next unblocked operational slices only:

- Slice 5 — hired → employee **prefill** (do not auto-provision)
- Slice 6 — time-off ops: manual balance ledger, holiday CRUD, holiday exclusion from request days
- Leftover from PR #7 — `/people` directory RSC must use the same `scopedEmployeeIds` as `GET /api/employees` (fail closed)

Sign-in / Vendasta OIDC, Bamboo migration, production env, India letter copy, email/Resend, T&A epic, careers embed, and resume upload stay untouched.

## Why this round

PR #7 closed careers DTO, applicant PII reads, letter issuance, and regional allowlists. Remaining operational gaps that are unblocked: People Ops still re-types hired candidates, cannot correct balances, and cannot maintain holidays. The `/people` and `/people/directory` RSCs still short-circuit to `"all"` for everyone except `regional_view`, so an employee or manager session sees the company directory even though the API is scoped.

## Out of scope

- Slice 3 India letter legal copy (blocked on a People Ops list)
- Slice 7 T&A (timesheets-from-clocks, overtime, projects, Bamboo time APIs)
- Slice 8 email / Resend
- Custom-level builder, careers embed, resume upload, scheduled report delivery, Blob provisioning
- `lib/auth.ts` / Vendasta OIDC, PKCE/state/nonce/signature, `allowDangerousEmailAccountLinking`, `ALLOW_DEV_AUTH_IN_PRODUCTION`
- Production migrate/seed/reset, merge, deploy, force-push, rebase of pushed history, real employee data

## Constraints that apply to every slice

- `@vendasta.com` work emails stay directory-visible; any other address is personal (self or `canViewSensitivePersonalInfo` only)
- Public careers DTO and apply API stay unchanged (no employee/applicant leak)
- Candidate PII and hire-prefill require `hiringAccessForCandidate`
- Offer salary is never copied onto the employee record and is never returned on the hire-prefill payload
- Schema changes are additive. Next migration after `0027_parity_first_round` is **`0028`**. Do not rewrite 0027. Do not migrate production
- Tests cover permitted and denied roles, scope, holiday exclusion, and no auto-provision on `stage=hired`

---

## Leftover — Directory RSC scope

`GET /api/employees` already calls `scopedEmployeeIds`. `/people` and `/people/directory` only call it when `accessLevel === "regional_view"` and otherwise set `allowed = "all"`.

**Policy:** Every people-directory RSC uses `scopedEmployeeIds` unconditionally (same helper as the API). Employee → self; manager → self + direct reports; `regional_view` → self ∪ allowlist (empty allowlist = self); `full_admin` / `canManageUsers` / `global_view` → `"all"`. Missing actor or permissions → empty set, never `"all"`.

Also fail-closed on `/people/[id]`: currently the profile page only checks scope for `regional_view`.

---

## Slice 5 — Hired → employee (prefill, do not auto-provision)

### Behavior

From a candidate with `stage=hired`, a user who passes `hiringAccessForCandidate` (hiring lead, `canManageUsers` / HR, or `full_admin`) can open `/people/new?candidateId=` with **safe already-known fields** prefilled:

- `firstName`, `lastName`, `email`
- `workPhone` from candidate phone
- `linkedInUrl` from candidate LinkedIn
- `jobTitle`, `departmentId`, `locationId` from the opening (job title may come from the offer letter title)
- `hireDate` from offer `startDate` when present
- `employmentStatus` from opening `employmentType` when it is a valid employment status

Never prefill or persist: offer salary, resume URL, notes, ratings, compensation.

Submit reuses `POST /api/employees/create`. The existing wizard still creates the employee, onboarding tasks, hire status history, and `employee_created` audit. When `candidateId` is present:

- Re-check `hiringAccessForCandidate` and `stage=hired`
- Set `candidates.employee_id` to the new employee (link)
- Audit `changes.candidateId`
- Do **not** insert `users` / sessions / `vendastaSub` (no login provisioning)

`PATCH` candidate `stage=hired` does **not** create an employee.

General `/people/new` without a hired candidate remains `full_admin` or `canManageUsers`. A hiring lead may use the wizard **only** with a hired candidate they are authorized for. Hiring leads cannot set `accessLevel` other than `employee`.

If the candidate is already linked, or the email already exists on an employee, return 409. Public careers and apply stay `{ success: true }` only.

### Data

Additive on `candidates`:

- `employee_id` nullable FK to `employees.id`
- Unique so one candidate maps to at most one employee

---

## Slice 6 — Time-off ops

### Manual balance adjustments

Reuse existing `time_off_balance_adjustments` as the durable ledger (who = `adjustedBy`, when = `createdAt`, employee + policy via `balanceId`, delta = `amount`, reason).

- `POST /api/time-off/adjustments` with `{ employeeId, policyId, amount, reason }`
- Actor: `full_admin` or `canManageUsers`
- Target must pass `employeeInScope` / `scopedEmployeeIds`
- Same transaction: apply delta to `time_off_balances.balance` and insert ledger row
- Reason required; amount finite and non-zero

### Holiday CRUD

Holidays stay **company-wide** (not employee-scoped; iCal holidays remain org-wide as in PR #7).

- `GET /api/holidays` — authenticated
- `POST /api/holidays`, `PATCH`/`DELETE /api/holidays/[id]` — `full_admin` or `canManageUsers`
- UI on `/time-off/holidays` (today read-only seed): HR/full_admin can add/edit/delete

### Request day counts

`daysRequested` for new pending (and therefore later approved) requests must exclude company holiday dates. Recurring holidays match on month-day. No new weekend/non-working-day rules (none exist today). Apply in session `POST /api/time-off/requests` and Bamboo `POST /api/bamboo/v1/time-off/create`. Stored `daysRequested` remains what dashboards sum for pending/approved.

---

## Test acceptance (minimum)

| Area | Pass | Fail |
|---|---|---|
| Directory RSC helper | Employee/manager scope is not `"all"`; pages call `scopedEmployeeIds` unconditionally | `regional_view` ternary still assigns `"all"` |
| Hire prefill | Hiring lead / HR / full_admin opens wizard from hired candidate; employee row + candidate link + audit; no `users` row | `stage=hired` PATCH creates an employee; outsider 403; salary in prefill; public apply returns candidate |
| Adjustments | HR/full_admin in-scope delta writes ledger + new balance | Employee/manager 403; out-of-scope 403 |
| Holidays | HR creates/updates/deletes; request spanning a holiday stores days minus that date | Unauth write 401; employee write 403 |

## Remaining limits after this round

India templates, email alerts, custom-level builder, T&A depth, embed, resume upload, Blob token, scheduled report delivery, per-country holiday calendars / weekend rules, login provisioning for new hires. Not full Bamboo parity.
