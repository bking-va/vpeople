# BambooHR Feature Parity Checklist

Full feature parity with Vendasta's BambooHR Core plan plus Time & Attendance and Job Postings add-ons.

**Excluded:** Payroll, Benefits Admin, Performance (using Lattice externally), Global Employment, Total Rewards, pay bands.

## Progress

- [x] Initial setup and seed data
- [x] Basic authentication (Google SSO, dev login)
- [x] Basic employee profiles
- [x] Simple time-off system
- [ ] **In Progress:** Screenshots and documentation

---

## 1. Home Dashboard Widgets

- [x] My time-off balances with Request button ✅ Done
- [x] To-do feed ✅ Done
  - [x] Time-off approvals ✅ Done
  - [x] Timesheet approvals ✅ Done (widget on dashboard shows pending timesheets)
  - [x] Onboarding tasks ✅ Done
  - [x] Documents to sign ✅ Done (dashboard to-do lists pending_signature docs; links to profile Documents tab)
- [x] Direct reports widget ✅ Done
- [x] Headcount chart ✅ Done
- [x] Turnover chart ✅ Done (12-month hires/terms sparkline on dashboard + /reports/turnover)
- [x] Location charts ✅ Done
- [x] Celebrations (birthdays and anniversaries) ✅ Done
- [x] Who's Out calendar ✅ Done (dashboard widget of who's out today + /time-off/calendar month view)
- [x] Company Links ✅ Done
- [x] New team members widget ✅ Done
- [x] People without raise in 12+ months ✅ Done (dashboard widget + `/reports/standard?type=no-raise`; pay amounts hidden without canViewCompensation)
- [x] Onboarding overdue/scheduled ✅ Done (dashboard overdue/scheduled counts; `/onboarding` already listed tasks)
- [ ] Announcements - Missing

---

## 2. Employee Profile Tabs

### Personal Tab
- [x] All standard fields
- [x] Custom fields ✅ Complete (dbed588)
  - [x] Custom field display on personal tab ✅ Done
  - [x] Custom field editing (permission-aware) ✅ Done
  - [x] Seeded: T-Shirt Size (select) ✅ Done
  - [x] Seeded: Dietary Preferences (textarea) ✅ Done
  - [ ] Meal Preference-Chennai (can add via Settings)
  - [ ] Social House (can add via Settings)
  - [ ] VendastaID (can add via Settings)
  - [ ] GitHub (can add via Settings)
  - [ ] Google ID (can add via Settings)
  - [ ] Alternate emails (can add via Settings)
  - [ ] Languages (can add via Settings)
  - [ ] Disabilities (can add via Settings)
- [x] Address fields ✅ Done (street, city, province, postal, country on personal tab)
- [x] Contact information ✅ Done (work/mobile/home phone, personal email)
- [x] Social links ✅ Done (LinkedIn, Twitter, GitHub)
- [x] Visa table ✅ Done (employee_visas + Personal tab; seed sample; no CRUD UI)
- [x] Education table ✅ Done (employee_education + Personal tab; seed sample; no CRUD UI)

### Job Tab
- [x] Hire Date
- [ ] Pay Group
- [x] Job Type/Level/Family
- [ ] Acquisition source
- [ ] SOC II scope flag

### Job Effective-Dated Tables
- [x] Employment Status history (in Job History table)
- [x] Job Info (location, division, department, multi-team, title, reports-to)
- [ ] Payroll & Finance
- [x] Compensation
- [ ] Pay Adjustments
- [x] Annual Bonus
- [ ] Variable Plan
- [ ] Variable Pay Actuals
- [ ] Supplements
- [ ] Internal Reporting (CAC fields)
- [ ] Shift Timing
- [x] Equity
- [ ] Statutory Bonus

### Other Profile Tabs
- [x] Time Off (basic implementation exists)
- [x] Documents with folder structure (stub)
- [x] Emergency contacts (basic implementation exists)
- [x] Notes (basic implementation exists)
- [x] Training (stub)
- [x] Benefits (stub - policy number, member ID, dependents)
- [x] Assets and company credit cards (stub)
- [x] Onboarding (basic implementation exists)
- [x] Offboarding (basic implementation exists)

### Customization
- [ ] Admin can add custom fields per tab
- [ ] Admin can add custom tables per tab

---

## 3. People Views

- [x] List view (basic) ✅ Done
- [x] Directory with filters (department, location, search) ✅ Done (table view at /people/directory)
- [x] Export to CSV ✅ Done
- [x] Org chart (basic) ✅ Done (redirect from /people/org-chart to /org-chart)
- [x] Org chart export ✅ Done (GET /api/org-chart/export generates CSV with full reporting structure)
- [x] Saved views schema (people_views table) ✅ Done
- [x] Saved views UI (create, edit, delete, apply) ✅ Complete (PeopleViewSelector wired into /people and /people/directory)
- [x] Column chooser UI ✅ Complete (ColumnChooserDialog wired into /people/directory with localStorage persistence)
- [x] New Employee wizard ✅ Done (/people/new - see section 9)
- [x] Terminate employee flow ✅ Done (/people/[id]/terminate - see section 9)
  - [ ] Termination reasons - Missing
  - [ ] Canadian ROE code mapping - Missing
- [ ] Rehire flow - Missing

---

## 4. Settings and Admin

### Editable Lists
- [x] Departments (basic)
- [x] Divisions (basic)
- [x] Teams (basic)
- [x] Locations with addresses (basic)
- [x] Job Titles ✅ Done (settings list + CRUD API at /settings/job-titles)
- [ ] Job Profiles (family/level)
- [ ] Employment Statuses
- [ ] Comp Change Reasons
- [ ] Termination Reasons
- [ ] Degrees
- [ ] Emergency Relationships
- [ ] Nationalities
- [ ] Pay Groups/Schedules
- [ ] Custom lists

### Custom Fields
- [x] Custom fields schema ✅ Complete
- [x] Field types (text, number, date, select, textarea, checkbox) ✅ Complete
- [x] Entity type support (employee, job, compensation, etc.) ✅ Complete
- [x] Section/tab assignment ✅ Complete
- [x] Required field option ✅ Complete
- [x] Settings page to list custom fields ✅ Complete
- [x] Custom field creation/edit forms ✅ Done (dbed588)
- [x] Custom field CRUD API ✅ Done (dbed588)
- [x] Display custom fields on entity pages ✅ Done (dbed588 - personal & job tabs)
- [x] Edit custom field values ✅ Done (dbed588 - permission-aware)

### Access Levels
- [x] Basic RBAC (employee, manager, admin, full_admin) - hardcoded in session
- [x] Settings page UI - inspection view
- [x] Access levels stored in DB
- [x] Access levels editable via UI forms ✅ NEW
- [ ] No Access level
- [ ] Post-Employment level
- [ ] Custom levels (scoped by region/department)
- [x] Per-field-group permissions stored in DB
  - [x] Compensation restrictions
  - [x] SIN/SSN restrictions
  - [x] Bank data restrictions
- [ ] Multiple levels per user
- [ ] Access history log

### Approval Workflows
- [x] Settings page UI - inspection view with enable/disable toggle
- [x] Workflows stored in DB
- [x] Workflows editable via UI forms ✅ Done
  - [x] Edit name, description
  - [x] Edit approval requirements (manager/admin)
  - [x] Edit auto-approve days
- [x] Multi-step approval chains infrastructure ✅ Complete
  - [x] approval_requests and approval_request_steps tables
  - [x] Time off requests with multi-step approvals (via lib/approvals.ts)
  - [x] Atomic approval + balance deduction using db.batch ✅ Done (b33c7ec)
  - [x] Timesheet approvals with multi-step support (schema ready)
  - [x] Legacy single-step fallback when no workflow attached
  - [x] Approval progress UI with step tracking and status icons
  - [x] ApprovalStatus component showing current step and approver
  - [x] Workflow step builder UI ✅ Done
  - [x] Seeded workflow steps ✅ Done (time_off, compensation_change, job_info_change)
  - [x] Unified approvals dashboard (/approvals) ✅ Done (b33c7ec)
  - [x] /approvals shows only the current pending step ✅ Done
  - [x] Blocked approvers (self-approval and requester final approval) are hidden ✅ Done
  - [x] Audit entry on every approve/reject step, same transaction ✅ Done
  - [x] Approval/rejection actions for all workflow types ✅ Done (b33c7ec)
- [ ] Information Updates (by location) - Missing
- [x] Time Off (reports-to) ✅ Done (workflow-driven when enabled, balance deducted atomically)
- [x] Compensation changes with approval ✅ Done (routes through workflow, commits to compensationHistory on final approval)
- [ ] Employment Status changes with approval - Missing
- [x] Job Info changes with approval ✅ Done (routes through workflow, updates employee record and jobHistory on final approval)
- [ ] Promotion workflow - Missing
- [x] Enable/disable per workflow ✅ Done
- [ ] Configurable requester and approver paths - Partial (approver role-based)

### Email Alerts
- [ ] Birthday alerts
- [ ] Anniversary alerts
- [ ] Termination notifications (by region)
- [ ] New hire notifications (by region)
- [ ] Pending time-off alerts
- [ ] Task reminders
- [ ] Resend integration
- [ ] Email logging (default: don't send real email)

### General Settings
- [ ] Date format (dd/mm/yyyy)
- [ ] Currency (CAD)
- [ ] Timezone (Saskatchewan)
- [ ] Display name format

### Integrations
- [x] iCalendar feeds ✅ Complete (dbed588)
  - [x] Who's out calendar (GET /api/calendar/[token]/time-off)
  - [x] Holidays calendar (GET /api/calendar/[token]/holidays)
  - [x] Per-user secret calendar token schema (calendarToken field)
  - [x] Token generation UI ✅ Done (dbed588 - CalendarFeeds component)
  - [x] Token regeneration ✅ Done (dbed588 - POST /api/calendar/generate-token)
  - [x] Subscribe URLs display ✅ Done (dbed588 - shown on /time-off page)
  - [x] Vercel Authentication caveat documented ✅ Done (alert in CalendarFeeds)
  - [ ] Birthdays calendar - Missing
- [x] Outbound webhooks ✅ Done

---

## 5. Time Off

- [x] Basic policies (seeded, not editable)
- [x] Policy management UI (create, edit policies) ✅ Done (4f22048 - Settings page + CRUD API + integration tests)
- [ ] Categories
- [x] Accrual rules that run on schedule ✅ Done (daily Vercel cron `/api/cron/accrue-time-off`; unique `(balanceId, periodKey)` so monthly/annual/biweekly apply once per period; skips terminated; caps at maxBalance)
- [x] Carryover rules ✅ Done (year-start forfeit above `maxCarryover` before accrual; idempotent `carryover:YYYY` period key)
- [ ] Manual balance adjustments with history
- [ ] Multi-country policies
  - [ ] Canada
  - [ ] US
  - [ ] India
  - [ ] Netherlands
  - [ ] Mexico
  - [ ] Armenia
- [ ] Holiday calendars per country
- [ ] Year views
- [x] Employee request submission with balance check ✅ Done (POST /api/time-off/requests rejects insufficient balance)
- [x] Manager approve/deny actions (basic)
- [x] Balance history and audit trail ✅ Done (accrual, carryover, and used leave write `time_off_balance_adjustments`; profile Time Off tab + `/time-off/balances`)
- [x] Who's-out calendar view ✅ Done (/time-off/calendar + dashboard widget)

---

## 6. Time & Attendance

- [x] Clock in/out ✅ Done (ClockWidget component + /api/time-tracking/clock)
- [x] Break tracking ✅ Done (Server-side persistence with breakStart timestamp, survives refresh)
- [x] Timesheets with approval ⚠️ Partial (DB schema + API routes + /time-tracking page UI)
- [ ] Projects - Missing
  - [ ] Team live view - Missing
  - [ ] Late status - Missing
  - [ ] Early status - Missing
  - [ ] Break violations - Missing
  - [ ] Unscheduled status - Missing
- [ ] Groups - Missing
- [ ] Overtime status - Missing
- [ ] Reports - Missing

---

## 7. Hiring (ATS)

- [x] Dashboard UI with real data
- [x] Job openings
  - [x] Create, edit, close openings
  - [x] Statuses: Draft, Open, On Hold, Filled, Canceled
  - [x] Hiring lead assignment
- [x] Candidates
  - [ ] Public application form
  - [x] Pipeline stage moves (dropdown on candidate detail)
  - [x] Notes with author attribution
  - [x] 5-star ratings
  - [x] Offer letters (create, edit)
- [x] Seed demo data (4 openings, 5 candidates)

### Job Openings
- [x] Job opening CRUD
- [x] Job opening statuses
  - [x] Draft
  - [x] Open
  - [x] On Hold
  - [x] Filled
  - [x] Canceled
- [x] Hiring lead assignment
- [ ] Public careers page
- [ ] Embed code for careers page
- [ ] Public application form

### Candidates
- [x] Candidate management with detail pages
- [x] Filter by opening
- [x] Stage moves
- [x] Ratings (1-5 stars)
- [x] Notes
- [x] Offer letters
- [ ] Filter by hiring lead
- [ ] Customizable pipeline statuses
- [ ] Disqualify reasons

### Sources
- [ ] Glassdoor
- [ ] Indeed
- [ ] LinkedIn
- [ ] Naukri
- [ ] Referral
- [ ] Campus
- [ ] Other sources

### Candidate Tools
- [ ] Star ratings
- [ ] Notes
- [ ] Comments
- [ ] Email templates with merge fields
- [ ] Auto-acknowledgement emails
- [ ] Interview templates
- [ ] Self-scheduling
- [ ] Talent pools
- [ ] Offer templates with e-sign
- [ ] "Hired" → creates employee record

---

## 8. Files and E-Signature

- [x] Company file categories ✅ Done (documents.category enum)
- [x] Employee folders ✅ Done (documents linked to employeeId)
- [x] Signature templates with merge fields ⚠️ Partial (documents.status enum includes pending_signature and signed; sign endpoint exists)
  - [ ] Offer letter - Template missing
  - [ ] Merit/increase letter - Template missing
  - [ ] Promotion letter - Template missing
  - [ ] Title change letter - Template missing
  - [ ] Commission letter - Template missing
  - [ ] Termination letter - Template missing
  - [ ] India-specific letters - Template missing
- [x] Pending Signatures view ✅ Done (ProfileDocuments + home to-do widget for pending_signature)
- [x] Signed documents archive ✅ Done (ProfileDocuments component shows signed docs)
- [x] Vercel Blob storage integration ⚠️ Partial (upload/download routes exist; Blob token not provisioned)

---

## 9. Onboarding and Offboarding

- [x] New Employee wizard ✅ Done (/people/new with 4-step form)
  - [x] Auto-generates employee number
  - [x] Triggers onboarding tasks from templates
  - [x] Manager assignment
- [x] Terminate/Offboard flow ✅ Done (/people/[id]/terminate)
  - [x] Effective-dated termination
  - [x] Triggers offboarding tasks from templates
  - [x] Audit logging
- [x] Basic task templates ✅ Done (onboarding/offboarding types in task_templates)
- [x] Due dates relative to hire/termination date ✅ Done (dueDaysFromStart calculation)
- [ ] Task list templates by role - Partial (assignedToRole exists, needs expansion)
  - [ ] Employee tasks
  - [ ] Manager tasks
  - [ ] People Ops tasks
  - [ ] Operations tasks
- [ ] New hire packet - Missing
- [ ] Post-employment access control - Missing

---

## 10. Training

- [x] Training categories ⚠️ Partial (training_courses.category column exists)
- [x] Training types ✅ Done (training_courses table with all fields)
  - [x] Required flag ✅ Done
  - [x] Frequency ✅ Done
  - [x] Due date relative to hire date ✅ Done (dueDate in training_completions)
- [x] Training completions tracking ✅ Done (training_completions + status enum + scores)
- [x] Training assignment UI ✅ Done (/training/assign page for assigning courses to individuals or departments)

---

## 11. Reports

### Standard Reports
- [x] Headcount report ✅ Done (/reports/headcount + CSV export by department/location/status)
- [x] Turnover report ✅ Done (/reports/turnover + dashboard chart + CSV `type=turnover`)
- [x] Additions/Terminations report ✅ Done (/reports/standard?type=additions)
- [x] Pay by Title ✅ Done (`/reports/standard?type=pay-by-title`; `canViewCompensation`)
- [x] Pay by Department ✅ Done (`/reports/standard?type=pay-by-department`; `canViewCompensation`)
- [x] Pay by Location ✅ Done (`/reports/standard?type=pay-by-location`; `canViewCompensation`)
- [x] Audit Trail ✅ Complete (dbed588)
  - [x] Document deletion logged
  - [x] Compensation changes logged  
  - [x] Employee creation/termination logged
  - [x] Time off approval/denial logged
  - [x] Job info updates logged
  - [x] Sensitive field redaction (salary, SIN, SSN, bank) — stored unredacted; redacted at read time. Comp viewers with canViewCompensation see amounts.
- [ ] Change History
- [ ] Missing Data report
- [ ] Point-in-Time report
- [x] Age profile ✅ Done (/reports/standard?type=age-gender)
- [x] Gender profile ✅ Done (/reports/standard?type=age-gender)
- [x] Birthdays report ✅ Done (/reports/standard?type=birthdays)
- [x] Employment Status History ✅ Done (`employment_status_history`; hire/job-update/terminate; Job tab + report)
- [x] Job History ✅ Done (/reports/standard?type=job-history)
- [x] Years of Service ✅ Done (/reports/standard?type=years-of-service)
- [ ] Candidate Sources
- [ ] Candidate Funnel
- [x] Last Pay Change ✅ Done (/reports/standard?type=last-pay-change; requires canViewCompensation)
- [x] Salary History ✅ Done (`/reports/standard?type=salary-history`; `canViewCompensation`)
- [x] Time Off Balances ✅ Done (/reports/standard?type=time-off-balances)
- [x] Time Off Schedule ✅ Done (`/reports/standard?type=time-off-schedule`; approved + pending overlapping the year)
- [x] Time Off Used ✅ Done (/reports/standard?type=time-off-used)
- [ ] Timesheet Hours
- [ ] Project Hours
- [ ] eNPS scores

### Custom Report Builder
- [x] Field selection ✅ Done (/reports/custom page with multi-select)
- [x] Filters ⚠️ Partial (filter UI exists; backend filtering not fully implemented)
- [x] Group-by ✅ Done (grouping selector and preview)
- [x] Save reports ✅ Done (Save Report button + dialog, saved_reports table + API)
- [x] Scheduled reports ✅ Done (scheduled_reports table + API; schedules stored, no external delivery)
- [ ] Share reports - Missing
- [x] Export CSV ✅ Done (preview endpoint returns CSV)
- [ ] Access level enforcement - Missing

---

## 12. Surveys and AI

- [x] eNPS surveys ✅ Done (enps_surveys + enps_responses + eNPS creation UI at /enps/create)
- [ ] Wellbeing surveys - Missing
- [ ] "Ask vPeople" AI assistant - Missing
  - [ ] AI SDK integration - Missing
  - [ ] AI Gateway integration - Missing
  - [ ] Policy knowledge base - Missing
  - [ ] Access-level-aware responses - Missing

---

## 13. API

- [x] Basic Bamboo-compatible shim ✅ Done
- [x] Extended Bamboo API endpoints ⚠️ Partial
  - [x] `/api/bamboo/v1/employees/directory` ✅ Done (with permission enforcement)
  - [x] `/api/bamboo/v1/employees/{id}` ✅ Done (with permission enforcement, returns compensation fields when canViewCompensation=true)
  - [x] `/api/gateway/v1/[company]/employees/directory` ✅ Done
  - [x] `/api/gateway/v1/[company]/employees/{id}` ✅ Done
  - [x] `/api/gateway/v1/[company]/reports/custom` ✅ Done
  - [x] `/api/bamboo/v1/time_off/requests` ✅ Done
  - [x] `/api/bamboo/v1/time_off/create` ✅ Done
  - [ ] `/time_off/whos_out` - Missing
  - [ ] `/tables/jobInfo` - Missing
  - [ ] `/tables/compensation` - Missing
  - [ ] `/tables/employmentStatus` - Missing
  - [ ] `/files` - Missing
  - [ ] `/meta/fields` - Missing
  - [ ] `/meta/lists` - Missing
  - [ ] `/employees/changed` - Missing
  - [ ] `/applicant_tracking/applications` - Missing
  - [ ] `/applicant_tracking/jobs` - Missing
  - [x] Webhook endpoints ✅ Done (/api/webhooks CRUD + delivery with HMAC + retry logic)
- [x] API key management ✅ Done
  - [x] Per-integration keys ✅ Done (generate/revoke UI at /settings/api-keys)
  - [x] Scope configuration ✅ Done (inherits from user access level)
  - [x] Last-used timestamps ✅ Done (displayed on /settings/api-keys, updated on each successful auth)
  - [x] Status display (active/revoked) ✅ Done (b33c7ec)
  - [x] Creation date display ✅ Done (b33c7ec)
  - [x] Permission enforcement ✅ Done (field-level filtering for compensation/SIN/bank)
  - [x] Security tests ✅ Done (bamboo-security.test.ts verifies auth + scope)
- [ ] Support for 31 Bamboo integrations - Missing

---

## 14. SSO and Security

- [x] Google SSO restricted to @vendasta.com
- [x] Basic audit log ⚠️ Partial (audit_logs table)
- [x] Comprehensive audit log ⚠️ Partial (/settings/audit admin page)
  - [x] Action tracking with user attribution
  - [x] Entity type and ID tracking
  - [x] Changes object with old/new values
  - [x] Sensitive field redaction (salary, SIN/SSN, bank) in UI
  - [x] Last 100 events display
  - [x] Employee creation/termination logged
  - [x] Document deletion logging ✅ Done (DELETE route creates audit log with document details)
  - [x] Compensation changes logging ✅ Done (logged in updateEmployeeCompensation and approval completion)
  - [ ] Full change history per entity - Missing (no entity-specific view)
- [ ] Security settings page
- [ ] Session management
- [ ] Two-factor authentication option

---

## Testing and Quality

- [x] Comprehensive test coverage ⚠️ Partial
  - [x] Security tests for API permissions + webhook delivery tests
  - [x] Integration tests against real Postgres ✅ Done
    - [x] Time-off approval balance deduction (single and 2-step)
    - [x] Compensation change workflow routing
    - [x] Job info change workflow routing
    - [x] Bamboo API permission enforcement
- [ ] E2E tests for critical flows - Missing
- [ ] Performance testing - Missing
- [x] Security audit ⚠️ Partial (API key auth + field-level permissions + scope enforcement verified)
- [ ] Accessibility compliance - Missing

---

## Deployment

- [x] Vercel deployment configured ✅ Done
- [x] Environment variables documented ✅ Done
- [x] Database migrations ✅ Done (0000-0010 migrations complete)
- [ ] Production monitoring - Missing
- [ ] Backup strategy - Missing
- [ ] Disaster recovery plan - Missing

---

**Last Updated:** 2026-11-09  
**Current Phase:** 
- ✅ Multi-step approvals complete (time-off, comp changes, job info changes)
- ✅ Atomic balance deduction using db.batch
- ✅ Unified /approvals dashboard
- ✅ Integration tests against real Postgres
- ✅ Seed org structure: CEO with exactly 6 direct reports, no manager >10 reports, 85 total employees
- ✅ Bamboo API compensation fields returned when canViewCompensation=true
- ✅ API keys UI shows status, created date, and last-used timestamps
