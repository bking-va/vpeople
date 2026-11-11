# Slice 1: Careers public DTO + applicant PII ACL

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unauthenticated careers surfaces emit an explicit public DTO with no employee/applicant/hiring-lead data, and candidate PII reads require hiring access on both API and pages.

**Architecture:** A shared mapper in `lib/careers-public.ts` is the only shape public routes and RSC pages may return. Internal candidate GET/PATCH/notes and hiring RSC pages call `hiringAccessForCandidate` before selecting PII columns.

**Tech Stack:** Next.js 15 App Router, Drizzle, Jest unit + integration (`npm test`, `npm run test:integration`).

## Global Constraints

- No auth/OIDC, Bamboo migration, live email, production migrate/seed
- Preserve `@vendasta.com` directory-visible vs personal-email rules
- Public response must never include hiringLeadId, emails, applicant records, or employee names
- Schema: none required for this slice

## File Map

- Create: `lib/careers-public.ts` — DTO type, field list, mapper
- Create: `app/api/careers/openings/route.ts` — public GET list
- Create: `app/api/careers/openings/[id]/route.ts` — public GET one, 404 if not open
- Modify: `app/careers/page.tsx` — use mapper
- Modify: `app/careers/[id]/apply/page.tsx` — use mapper
- Modify: `app/api/hiring/candidates/[id]/route.ts` — add GET with hiring ACL
- Modify: `app/(dashboard)/hiring/candidates/[id]/page.tsx` — gate before PII query
- Modify: `app/(dashboard)/hiring/openings/[id]/candidates/page.tsx` — same
- Modify: `app/api/hiring/candidates/apply/route.ts` — assert JSON is `{ success: true }` only (already true; lock with test)
- Create: `__tests__/api/careers-public.test.ts`
- Modify: `__tests__/api/auth-guard.test.ts` — public careers allowed; candidate GET 401
- Modify: `__tests__/integration/security-authz.integration.test.ts` — apply body, candidate GET 403/200

---

## Task 1: Public DTO mapper

**Files:** `__tests__/api/careers-public.test.ts`, `lib/careers-public.ts`

- [ ] **Step 1: RED** — test `toPublicCareerOpening` copies only `id, title, employmentType, description, requirements, openDate, departmentName, locationName` and drops `hiringLeadId`, emails, applicant arrays.

```bash
npm test -- __tests__/api/careers-public.test.ts
```

Expected: fail, module missing.

- [ ] **Step 2: GREEN** — implement mapper + `PUBLIC_CAREER_OPENING_FIELDS` const.
- [ ] **Step 3:** Re-run unit test, expect pass.

---

## Task 2: Public GET routes + RSC

**Files:** `app/api/careers/openings/route.ts`, `app/api/careers/openings/[id]/route.ts`, careers pages, apply route test

- [ ] **Step 1: RED** — unit/integration: unauth GET list 200; draft id 404; JSON keys ⊆ public fields; apply success body `{ success: true }` with no `candidate`/`email`/`id`.
- [ ] **Step 2: GREEN** — query `status = 'open'` only, map through `toPublicCareerOpening`. Pages select the same columns and map. Apply already returns `{ success: true }`.
- [ ] **Step 3:** `npm test -- __tests__/api/careers-public.test.ts __tests__/api/auth-guard.test.ts`

Auth-guard must **not** require session on `/api/careers/*`.

---

## Task 3: Candidate PII read ACL

**Files:** candidate GET route, hiring RSC pages, integration tests

- [ ] **Step 1: RED** — integration: outsider session GET `/api/hiring/candidates/[id]` 403; hiring lead or full_admin 200 with email; PATCH still 403 for outsider.
- [ ] **Step 2: GREEN** — `GET` uses `hiringAccessForCandidate`; 401/404/403. Pages call the same helper and `redirect("/hiring")` when `!allowed`. Select PII only after the gate.
- [ ] **Step 3:** `npm run test:integration -- __tests__/integration/security-authz.integration.test.ts`

---

## Pass commands

```bash
npm test -- __tests__/api/careers-public.test.ts __tests__/api/auth-guard.test.ts
npm run test:integration -- __tests__/integration/security-authz.integration.test.ts
```
