# vPeople parity first round (slices 0, 1, 2, 4)

**Date:** 2026-11-11
**Status:** Approved for implementation
**Base:** `main` at `d0d8cf6b4995441638ade1037a848fe2776bb226`
**Does not claim:** full BambooHR parity

## Goal

Ship the approved first round only:

- Slice 0 — truthful docs
- Slice 1 — public careers DTO + internal applicant-PII read ACL
- Slice 2 — letter issuance into the existing pending-signature workflow
- Slice 4 — regional access v1 with explicit location/country allowlists, plus iCal scope regression

Sign-in / Vendasta OIDC and Bamboo data migration stay untouched.

## Why this round

PR 6 leftover names (India letters, email, custom access levels, public careers) are not remaining parity. Careers already exists. Letter templates are seeded but not issuable. Email is absent and deferred. Custom access is a toggle UI; `regional_view` currently sees everyone.

## Out of scope

- Auth.js / Vendasta OIDC (PKCE, state, nonce, RS256, `vendastaSub` binding, `allowDangerousEmailAccountLinking=false`, Google `signIn` deny)
- Dev auth / impersonation flags
- Bamboo import, production env/protection/resources, live email, deploy, merge, reset, reseed, real employee data
- India legal letter copy
- Email alerts / Resend
- Full Bamboo custom-level builder, No Access, post-employment, multiple levels per user, access history
- Hired → employee, T&A depth, embed widget, resume upload, Blob provisioning
- Changing `full_admin` or HR (`canManageUsers`) to a regional scope

## Constraints that apply to every slice

- `@vendasta.com` work emails stay directory-visible; any other address is personal (self or `canViewSensitivePersonalInfo` only)
- Public careers uses an explicit DTO and never exposes employee, applicant, or hiring-lead data
- Candidate PII read authorization is the same on pages and APIs, not mutations only
- Schema changes are additive (`IF NOT EXISTS` / `ADD VALUE IF NOT EXISTS`). Next migration number after `0026_open_hercules` is **`0027`**. Do not migrate production
- Tests cover permitted and denied roles, direct URL/API, reports/export where in path, unauthenticated public exposure, and letter document flow

---

## Slice 0 — Truthful docs

Update `docs/PARITY.md`, `README.md`, `API.md`, and `PRODUCTION_STATUS.md` so they match `main` plus this round:

- Public careers page and public application form exist
- Embed still missing
- Letter templates exist; **issuance** is what this round adds
- India-specific templates still missing
- Email alerts still later / not this round
- Custom access-level builder still missing; regional **allowlists for `regional_view`** are this round
- Do not mark T&A, hired→employee, or email as done
- Header/footer must not claim full Bamboo parity

---

## Slice 1 — Careers public DTO + internal applicant privacy

### Public DTO

Explicit fields only:

- `id`, `title`, `employmentType`, `description`, `requirements`, `openDate`
- `departmentName`, `locationName` (names, never FKs)

Forbidden on any unauthenticated careers surface: `hiringLeadId`, employee names/emails, applicant fields, candidate counts, draft/on-hold/filled/canceled openings.

Surfaces:

- `GET /api/careers/openings` (new, public, DTO only)
- `GET /api/careers/openings/[id]` (new, public, 404 if not `open`)
- `app/careers/page.tsx` and `app/careers/[id]/apply/page.tsx` must use the same mapper
- Existing `POST /api/hiring/candidates/apply` stays public; success body is `{ success: true }` only; honeypot fake 200; rate limit 429; non-open opening 404

### Internal applicant PII

PII: `firstName`, `lastName`, `email`, `phone`, `resumeUrl`, `linkedinUrl`, notes, ratings, offer salary.

Read **and** write require `hiringAccessForCandidate` / `canManageHiring` (hiring lead, `canManageUsers`, or `full_admin`).

- Add `GET /api/hiring/candidates/[id]` — 401 unauth, 404 missing, 403 without hiring access
- Existing PATCH/notes already 403; keep them
- RSC pages `/hiring/candidates/[id]` and `/hiring/openings/[id]/candidates` must not render PII for non-hiring sessions (redirect to `/hiring` or `notFound()`; API remains the 403 surface)
- Hiring dashboard may show job openings and aggregate counts; it must not list applicant emails/names to non-hiring users (it currently does not list them)

---

## Slice 2 — Letter issuance

Issue an existing `letter_templates` row to an in-scope employee as a `documents` row with `status = pending_signature`.

### Data

Additive on `documents`:

- `body` text (merged letter; no Blob required)
- `letterTemplateId` nullable FK

Add enum value `letter` with `ADD VALUE IF NOT EXISTS` and store issued letters under that category.

### Behavior

- `POST /api/letter-templates/[id]/issue` with `{ employeeId }`
- Actor: `full_admin` or `canManageUsers` (same gate on the settings page; session `role` is not sufficient because viewing roles map to `"employee"`)
- Target must pass `employeeInScope` for the actor
- Merge values from the employee record via `LETTER_MERGE_FIELDS` / `applyMergeFields`
- `payRate` included only when actor has `canViewCompensation`; otherwise omitted (empty)
- Reject unknown client-supplied merge keys (do not accept client merge maps; server-derived only)
- Unknown tokens already in the template stay as `{{token}}` (existing helper)
- Audit `letter_issued` with template slug, target employee, whether payRate was included
- Do not invent India legal text
- UI: issue control on `/settings/letter-templates`; issued letters appear on the employee Documents tab (`body` shown when `fileUrl` is null) and can be signed by the owner through the existing sign route

---

## Slice 4 — Regional access v1

### Policy (approved, not inferred)

- Allowlists are **per employee**, explicit **location IDs and/or country strings**
- Managed only by existing HR (`canManageUsers`) or `full_admin`
- `regional_view` with **zero** allowlist rows: fail closed — self only, never “all employees”
- `full_admin` is never region-scoped; API that would attach scopes to a `full_admin` employee returns 400
- `canManageUsers` (HR) and `global_view` keep org-wide visibility. This round does **not** silently lock them behind allowlists
- `manager` remains self + direct reports
- `employee` remains self

### Data

New table `employee_access_scopes`:

- `id`, `employee_id` FK, `location_id` FK nullable, `country` text nullable, timestamps
- At least one of `location_id` or `country` required
- Unique `(employee_id, location_id, country)`

### Behavior

- `canSeeAllEmployees` no longer treats `regional_view` as global
- `scopedEmployeeIds` for `regional_view`: self ∪ employees whose `locations.id` or `locations.country` matches the viewer’s allowlist
- Country match is case-insensitive trimmed string against `locations.country`
- APIs/reports that already call `scopedEmployeeIds` inherit this (custom reports, Bamboo directory, export paths that use the helper)
- `GET /api/employees` currently returns all `full_time` rows; it **must** filter with `scopedEmployeeIds` so regional viewers cannot export the directory by URL
- Settings API: `GET`/`PUT /api/settings/access-scopes` for one employee; PUT replaces that employee’s rows
- Settings UI under `/settings/access-levels` or `/settings/access-scopes`, full_admin/HR only
- Seed `access_levels` rows for `regional_view` and `global_view` (`onConflictDoNothing`). Do not auto-grant regions

### iCal leak (in this scoping path)

`GET /api/calendar/[token]/time-off` and `.../celebrations` currently return org-wide data given any valid per-user token. Filter events to `scopedEmployeeIds` of the token owner. Holidays remain company holidays (not employee PII). Invalid token still 404.

---

## Test acceptance (minimum)

| Area | Pass | Fail |
|---|---|---|
| Public careers GET | Unauth 200 with DTO fields only for `open` jobs | Body contains email, hiringLead, applicant, employee name |
| Public apply | 200 `{ success: true }`; draft 404; honeypot 200 without insert | Response includes candidate id/email |
| Candidate GET/page | Hiring lead / HR / full_admin 200 | Employee/manager (not lead) 403 |
| Letter issue | HR issues to in-scope employee; document `pending_signature`; owner can sign | Manager/employee 403; out-of-scope 403; payRate absent without compensation permission |
| Regional | Allowlisted location/country visible; empty allowlist = self only | `regional_view` sees other country; `full_admin` loses org-wide access |
| iCal | Employee token does not include another employee’s leave/birthday | Org-wide feed for an employee-level token |
| Email privacy | `@vendasta.com` still visible; Gmail still hidden for coworkers | Regression |

## Migrations / rollout

- Additive migration **`0027`** (name assigned at generate time; must not collide with `0026`)
- Apply in preview/test only via existing `npm run db:migrate` against the test database
- Existing `regional_view` demo users will see **self only** until HR assigns allowlists — that is fail-closed, not a `full_admin` lockout
- No production migrate/seed/reset from this work

## Remaining limits after this round

India templates, email alerts, custom-level builder, hired→employee, T&A, embed, resume upload, Blob token, scheduled report delivery, information-update workflows. Not full Bamboo parity.
