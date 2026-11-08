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

- [x] My time-off balances with Request button
- [x] To-do feed
  - [x] Time-off approvals
  - [ ] Timesheet approvals
  - [x] Onboarding tasks
  - [ ] Documents to sign
- [x] Direct reports widget
- [x] Headcount chart
- [ ] Turnover chart
- [x] Location charts
- [x] Celebrations (birthdays and anniversaries)
- [ ] Who's Out calendar
- [x] Company Links
- [x] New team members widget
- [ ] People without raise in 12+ months
- [ ] Onboarding overdue/scheduled
- [ ] Announcements

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

- [x] List view (basic)
- [ ] Directory cards (group and filter by location)
- [x] Org chart (basic)
- [ ] Org chart export
- [ ] New Employee wizard
- [ ] Terminate employee flow
  - [ ] Termination reasons
  - [ ] Canadian ROE code mapping
- [ ] Rehire flow

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
- [x] Basic RBAC (employee, manager, admin)
- [ ] Full Admin level
- [ ] No Access level
- [ ] Post-Employment level
- [ ] Custom levels (scoped by region/department)
- [ ] Per-field-group permissions
  - [ ] Compensation restrictions
  - [ ] SIN/SSN restrictions
  - [ ] Bank data restrictions
- [ ] Multiple levels per user
- [ ] Access history log

### Approval Workflows
- [ ] Information Updates (by location)
- [x] Time Off (reports-to) - basic
- [ ] Compensation changes
- [ ] Employment Status changes
- [ ] Job Info changes
- [ ] Promotion workflow
- [ ] Enable/disable per workflow
- [ ] Configurable requester and approver paths

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

- [x] Basic policies (partial)
- [ ] Categories
- [ ] Accrual rules
- [ ] Carryover rules
- [ ] Manual policies
- [ ] Multi-country policies
  - [ ] Canada
  - [ ] US
  - [ ] India
  - [ ] Netherlands
  - [ ] Mexico
  - [ ] Armenia
- [ ] Holiday calendars per country
- [ ] Year views
- [x] Request time off (basic)
- [x] Approve/deny (basic)
- [ ] Balance history
- [ ] Time-off calendar view

---

## 6. Time & Attendance

- [ ] Clock in/out
- [ ] Break tracking
- [ ] Timesheets with approval
- [ ] Projects
- [ ] Team live view
  - [ ] Late status
  - [ ] Early status
  - [ ] Break violations
  - [ ] Unscheduled status
- [ ] Groups
- [ ] Overtime status
- [ ] Reports

---

## 7. Hiring (ATS)

### Job Openings
- [ ] Job opening statuses
  - [ ] Draft
  - [ ] Open
  - [ ] On Hold
  - [ ] Filled
  - [ ] Canceled
- [ ] Hiring lead assignment
- [ ] Public careers page
- [ ] Embed code for careers page
- [ ] Application form

### Candidates
- [ ] Candidate management
- [ ] Filter by status
- [ ] Filter by rating
- [ ] Filter by source
- [ ] Filter by location
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

- [ ] Company file categories
- [ ] Employee folders
- [ ] Signature templates with merge fields
  - [ ] Offer letter
  - [ ] Merit/increase letter
  - [ ] Promotion letter
  - [ ] Title change letter
  - [ ] Commission letter
  - [ ] Termination letter
  - [ ] India-specific letters
- [ ] Pending Signatures view
- [ ] Signed documents archive
- [ ] Vercel Blob storage integration

---

## 9. Onboarding and Offboarding

- [x] Basic task templates (partial)
- [ ] Task list templates by role
  - [ ] Employee tasks
  - [ ] Manager tasks
  - [ ] People Ops tasks
  - [ ] Operations tasks
- [ ] Offboarding task templates
  - [ ] Voluntary termination
  - [ ] Involuntary termination
  - [ ] Contractor offboarding
- [ ] Assignees
- [ ] Due dates relative to hire/termination date
- [ ] New hire packet
- [ ] Post-employment access control

---

## 10. Training

- [ ] Training categories
- [ ] Training types
  - [ ] Required flag
  - [ ] Frequency
  - [ ] Due date relative to hire date
- [ ] Training completions tracking

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
- [ ] Field selection
- [ ] Filters
- [ ] Group-by
- [ ] Save reports
- [ ] Share reports
- [ ] Export CSV
- [ ] Access level enforcement

---

## 12. Surveys and AI

- [ ] eNPS surveys
- [ ] Wellbeing surveys
- [ ] "Ask vPeople" AI assistant
  - [ ] AI SDK integration
  - [ ] AI Gateway integration
  - [ ] Policy knowledge base
  - [ ] Access-level-aware responses

---

## 13. API

- [x] Basic Bamboo-compatible shim (skeleton)
- [ ] Extended Bamboo API endpoints
  - [ ] `/employees/directory`
  - [ ] `/employees/{id}` with fields parameter
  - [ ] `/reports/custom`
  - [ ] `/time_off/requests`
  - [ ] `/time_off/whos_out`
  - [ ] `/tables/jobInfo`
  - [ ] `/tables/compensation`
  - [ ] `/tables/employmentStatus`
  - [ ] `/files`
  - [ ] `/meta/fields`
  - [ ] `/meta/lists`
  - [ ] `/employees/changed`
  - [ ] `/applicant_tracking/applications`
  - [ ] `/applicant_tracking/jobs`
  - [ ] Webhook endpoints
- [ ] API key management
  - [ ] Per-integration keys
  - [ ] Scope configuration
  - [ ] Last-used timestamps
- [ ] Support for 31 Bamboo integrations

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

- [ ] Comprehensive test coverage
- [ ] E2E tests for critical flows
- [ ] Performance testing
- [ ] Security audit
- [ ] Accessibility compliance

---

## Deployment

- [x] Vercel deployment configured
- [x] Environment variables documented
- [x] Database migrations
- [ ] Production monitoring
- [ ] Backup strategy
- [ ] Disaster recovery plan

---

**Last Updated:** 2026-11-07  
**Current Phase:** Setting up parity checklist and completing initial screenshots
