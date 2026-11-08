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
  - [ ] Timesheet approvals - Missing (route exists but no widget)
  - [x] Onboarding tasks ✅ Done
  - [ ] Documents to sign - Missing (no widget)
- [x] Direct reports widget ✅ Done
- [x] Headcount chart ✅ Done
- [ ] Turnover chart - Missing
- [x] Location charts ✅ Done
- [x] Celebrations (birthdays and anniversaries) ✅ Done
- [ ] Who's Out calendar - Missing
- [x] Company Links ✅ Done
- [x] New team members widget ✅ Done
- [ ] People without raise in 12+ months - Missing
- [ ] Onboarding overdue/scheduled - Missing
- [ ] Announcements - Missing

---

## 2. Employee Profile Tabs

### Personal Tab
- [x] All standard fields
- [ ] Custom fields
  - [ ] Meal Preference-Chennai
  - [ ] Social House
  - [ ] Tshirt
  - [ ] VendastaID
  - [ ] GitHub
  - [ ] Google ID
  - [ ] Alternate emails
  - [ ] Languages
  - [ ] Disabilities
- [ ] Address fields
- [ ] Contact information
- [ ] Social links
- [ ] Visa table
- [ ] Education table

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
- [x] Org chart (basic) ✅ Done
- [ ] Org chart export - Missing
- [x] Saved views schema (people_views table) ✅ Done
- [x] Saved views UI (create, edit, delete, apply) ⚠️ Partial (PeopleViewSelector component exists but not wired into /people)
- [x] Column chooser UI ⚠️ Partial (ColumnChooser component exists, table view renders columns)
- [ ] New Employee wizard - Missing
- [ ] Terminate employee flow - Missing
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
- [ ] Job Titles
- [ ] Job Profiles (family/level)
- [ ] Employment Statuses
- [ ] Comp Change Reasons
- [ ] Termination Reasons
- [ ] Degrees
- [ ] Emergency Relationships
- [ ] Nationalities
- [ ] Pay Groups/Schedules
- [ ] Custom lists

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
- [x] Multi-step approval chains with custom approvers ✅ Done
  - [x] approval_requests and approval_request_steps tables
  - [x] Time off requests with multi-step approvals (via lib/approvals.ts)
  - [x] Timesheet approvals with multi-step support (schema ready)
  - [x] Legacy single-step fallback when no workflow attached
- [ ] Information Updates (by location) - Missing
- [x] Time Off (reports-to) ✅ Done (workflow-driven when enabled)
- [ ] Compensation changes with approval - Missing
- [ ] Employment Status changes with approval - Missing
- [ ] Job Info changes with approval - Missing
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
- [ ] iCalendar feeds
  - [ ] Who's out calendar
  - [ ] Birthdays calendar
- [ ] Outbound webhooks

---

## 5. Time Off

- [x] Basic policies (seeded, not editable)
- [ ] Policy management UI (create, edit policies)
- [ ] Categories
- [ ] Accrual rules that run on schedule
- [ ] Carryover rules
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
- [ ] Employee request submission with balance check
- [x] Manager approve/deny actions (basic)
- [ ] Balance history and audit trail
- [ ] Who's-out calendar view

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
- [x] Pending Signatures view ⚠️ Partial (ProfileDocuments component filters by status)
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
- [ ] Headcount report
- [ ] Turnover report
- [ ] Additions/Terminations report
- [ ] Pay by Title
- [ ] Pay by Department
- [ ] Pay by Location
- [ ] Audit Trail
- [ ] Change History
- [ ] Missing Data report
- [ ] Point-in-Time report
- [ ] Age profile
- [ ] Gender profile
- [ ] Birthdays report
- [ ] Employment Status History
- [ ] Job History
- [ ] Years of Service
- [ ] Candidate Sources
- [ ] Candidate Funnel
- [ ] Last Pay Change
- [ ] Salary History
- [ ] Time Off Balances
- [ ] Time Off Schedule
- [ ] Time Off Used
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
  - [x] `/api/bamboo/v1/employees/{id}` ✅ Done (with permission enforcement and scope checks)
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
  - [x] Last-used timestamps ⚠️ Partial (column exists, not updated on use)
  - [x] Permission enforcement ✅ Done (field-level filtering for compensation/SIN/bank)
  - [x] Security tests ✅ Done (bamboo-security.test.ts verifies auth + scope)
- [ ] Support for 31 Bamboo integrations - Missing

---

## 14. SSO and Security

- [x] Google SSO restricted to @vendasta.com
- [x] Basic audit log (partial)
- [ ] Comprehensive audit log on every change
- [ ] Security settings page
- [ ] Session management
- [ ] Two-factor authentication option

---

## Testing and Quality

- [x] Comprehensive test coverage ⚠️ Partial (security tests for API permissions + webhook delivery tests)
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

**Last Updated:** 2026-11-08  
**Current Phase:** Multi-step approvals, vacation balance fixes, document deletion
