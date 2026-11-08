import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  date,
  decimal,
  jsonb,
  primaryKey,
  pgEnum,
  serial,
  index,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "employee",
  "manager",
  "admin",
]);

export const accessLevelEnum = pgEnum("access_level", [
  "employee",
  "manager",
  "regional_view",
  "global_view",
  "full_admin",
]);

export const employmentStatusEnum = pgEnum("employment_status", [
  "full_time",
  "part_time",
  "contractor",
  "on_leave",
  "terminated",
]);

export const timeOffRequestStatusEnum = pgEnum("time_off_request_status", [
  "pending",
  "approved",
  "denied",
  "cancelled",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);

export const genderEnum = pgEnum("gender", [
  "male",
  "female",
  "non_binary",
  "prefer_not_to_say",
  "other",
]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified"),
  image: text("image"),
  role: userRoleEnum("role").default("employee").notNull(),
  employeeId: integer("employee_id"),
});

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires").notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires").notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  province: text("province"),
  country: text("country").notNull(),
  postalCode: text("postal_code"),
  timezone: text("timezone"),
  isHeadquarters: boolean("is_headquarters").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const divisions = pgTable("divisions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jobFamilies = pgTable("job_families", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
});

export const jobLevels = pgTable("job_levels", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
});

export const seats = pgTable("seats", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  accountabilities: jsonb("accountabilities").$type<string[]>(),
  parentSeatId: integer("parent_seat_id"),
  assignedEmployeeId: integer("assigned_employee_id"),
  isOpen: boolean("is_open").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const seatsRelations = relations(seats, ({ one }) => ({
  parentSeat: one(seats, {
    fields: [seats.parentSeatId],
    references: [seats.id],
    relationName: "seatHierarchy",
  }),
  assignedEmployee: one(employees, {
    fields: [seats.assignedEmployeeId],
    references: [employees.id],
  }),
}));

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  employeeNumber: text("employee_number").unique(),
  userId: text("user_id").references(() => users.id),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  lastName: text("last_name").notNull(),
  preferredName: text("preferred_name"),
  email: text("email").notNull().unique(),
  workPhone: text("work_phone"),
  extension: text("extension"),
  mobilePhone: text("mobile_phone"),
  homePhone: text("home_phone"),
  personalEmail: text("personal_email"),
  birthDate: date("birth_date"),
  gender: genderEnum("gender"),
  sin: text("sin"),
  ssn: text("ssn"),
  maritalStatus: text("marital_status"),
  nationality: text("nationality"),
  citizenship: text("citizenship"),
  addressStreet1: text("address_street1"),
  addressStreet2: text("address_street2"),
  addressCity: text("address_city"),
  addressProvince: text("address_province"),
  addressPostalCode: text("address_postal_code"),
  addressCountry: text("address_country"),
  linkedInUrl: text("linkedin_url"),
  twitterUrl: text("twitter_url"),
  githubUrl: text("github_url"),
  jobTitle: text("job_title"),
  departmentId: integer("department_id").references(() => departments.id),
  divisionId: integer("division_id").references(() => divisions.id),
  locationId: integer("location_id").references(() => locations.id),
  managerId: integer("manager_id"),
  hireDate: date("hire_date"),
  terminationDate: date("termination_date"),
  employmentStatus: employmentStatusEnum("employment_status")
    .default("full_time")
    .notNull(),
  jobFamilyId: integer("job_family_id").references(() => jobFamilies.id),
  jobLevelId: integer("job_level_id").references(() => jobLevels.id),
  accessLevel: accessLevelEnum("access_level").default("employee").notNull(),
  photoUrl: text("photo_url"),
  dietaryRestrictions: text("dietary_restrictions"),
  tshirtSize: text("tshirt_size"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const employeesRelations = relations(employees, ({ one, many }) => ({
  user: one(users, {
    fields: [employees.userId],
    references: [users.id],
  }),
  manager: one(employees, {
    fields: [employees.managerId],
    references: [employees.id],
    relationName: "managerEmployee",
  }),
  directReports: many(employees, {
    relationName: "managerEmployee",
  }),
  department: one(departments, {
    fields: [employees.departmentId],
    references: [departments.id],
  }),
  division: one(divisions, {
    fields: [employees.divisionId],
    references: [divisions.id],
  }),
  location: one(locations, {
    fields: [employees.locationId],
    references: [locations.id],
  }),
  jobFamily: one(jobFamilies, {
    fields: [employees.jobFamilyId],
    references: [jobFamilies.id],
  }),
  jobLevel: one(jobLevels, {
    fields: [employees.jobLevelId],
    references: [jobLevels.id],
  }),
  employeeTeams: many(employeeTeams),
  jobHistory: many(jobHistory),
  compensationHistory: many(compensationHistory),
  bonusDetails: many(bonusDetails),
  equityGrants: many(equityGrants),
  timeOffBalances: many(timeOffBalances),
  timeOffRequests: many(timeOffRequests),
  emergencyContacts: many(emergencyContacts),
  notes: many(employeeNotes),
  onboardingTasks: many(employeeTasks, { relationName: "onboardingTasks" }),
  offboardingTasks: many(employeeTasks, { relationName: "offboardingTasks" }),
}));

export const employeeTeams = pgTable(
  "employee_teams",
  {
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.employeeId, table.teamId] }),
  })
);

export const jobHistory = pgTable("job_history", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  effectiveDate: date("effective_date").notNull(),
  jobTitle: text("job_title"),
  departmentId: integer("department_id").references(() => departments.id),
  divisionId: integer("division_id").references(() => divisions.id),
  locationId: integer("location_id").references(() => locations.id),
  managerId: integer("manager_id").references(() => employees.id),
  employmentStatus: employmentStatusEnum("employment_status"),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const compensationHistory = pgTable("compensation_history", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  effectiveDate: date("effective_date").notNull(),
  payRate: decimal("pay_rate", { precision: 12, scale: 2 }),
  payType: text("pay_type"),
  paySchedule: text("pay_schedule"),
  currency: text("currency").default("CAD"),
  changeReason: text("change_reason"),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bonusDetails = pgTable("bonus_details", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  effectiveDate: date("effective_date").notNull(),
  bonusType: text("bonus_type"),
  eligibleAmount: decimal("eligible_amount", { precision: 12, scale: 2 }),
  currency: text("currency").default("CAD"),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const equityGrants = pgTable("equity_grants", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  grantType: text("grant_type").notNull(),
  grantDate: date("grant_date").notNull(),
  vestingStartDate: date("vesting_start_date"),
  sharesGranted: integer("shares_granted"),
  strikePrice: decimal("strike_price", { precision: 12, scale: 4 }),
  vestingSchedule: text("vesting_schedule"),
  vestingMonths: integer("vesting_months"),
  cliffMonths: integer("cliff_months"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const timeOffPolicies = pgTable("time_off_policies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  policyType: text("policy_type").notNull(),
  country: text("country"),
  accrualRate: decimal("accrual_rate", { precision: 10, scale: 4 }),
  accrualPeriod: text("accrual_period"),
  maxCarryover: decimal("max_carryover", { precision: 10, scale: 2 }),
  maxBalance: decimal("max_balance", { precision: 10, scale: 2 }),
  requiresApproval: boolean("requires_approval").default(true),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const timeOffBalances = pgTable("time_off_balances", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  policyId: integer("policy_id")
    .notNull()
    .references(() => timeOffPolicies.id, { onDelete: "cascade" }),
  balance: decimal("balance", { precision: 10, scale: 2 }).default("0").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const timeOffBalancesRelations = relations(
  timeOffBalances,
  ({ one }) => ({
    employee: one(employees, {
      fields: [timeOffBalances.employeeId],
      references: [employees.id],
    }),
    policy: one(timeOffPolicies, {
      fields: [timeOffBalances.policyId],
      references: [timeOffPolicies.id],
    }),
  })
);

export const timeOffRequests = pgTable("time_off_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  policyId: integer("policy_id")
    .notNull()
    .references(() => timeOffPolicies.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  daysRequested: decimal("days_requested", { precision: 10, scale: 2 }).notNull(),
  status: timeOffRequestStatusEnum("status").default("pending").notNull(),
  notes: text("notes"),
  reviewedBy: integer("reviewed_by").references(() => employees.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const timeOffRequestsRelations = relations(
  timeOffRequests,
  ({ one }) => ({
    employee: one(employees, {
      fields: [timeOffRequests.employeeId],
      references: [employees.id],
    }),
    policy: one(timeOffPolicies, {
      fields: [timeOffRequests.policyId],
      references: [timeOffPolicies.id],
    }),
    reviewer: one(employees, {
      fields: [timeOffRequests.reviewedBy],
      references: [employees.id],
    }),
  })
);

export const emergencyContacts = pgTable("emergency_contacts", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  relationship: text("relationship"),
  phone: text("phone").notNull(),
  alternatePhone: text("alternate_phone"),
  email: text("email"),
  isPrimary: boolean("is_primary").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const employeeNotes = pgTable("employee_notes", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  authorId: integer("author_id")
    .notNull()
    .references(() => employees.id),
  content: text("content").notNull(),
  isConfidential: boolean("is_confidential").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const taskTemplates = pgTable("task_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  taskType: text("task_type").notNull(),
  description: text("description"),
  assignedToRole: text("assigned_to_role"),
  dueDaysFromStart: integer("due_days_from_start"),
  orderIndex: integer("order_index").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const employeeTasks = pgTable("employee_tasks", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  templateId: integer("template_id").references(() => taskTemplates.id),
  taskType: text("task_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  assignedToId: integer("assigned_to_id").references(() => employees.id),
  status: taskStatusEnum("status").default("pending").notNull(),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  changes: jsonb("changes"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// Hiring / ATS Tables

export const jobOpeningStatusEnum = pgEnum("job_opening_status", [
  "draft",
  "open",
  "on_hold",
  "filled",
  "canceled",
]);

export const candidateStageEnum = pgEnum("candidate_stage", [
  "new",
  "phone_screen",
  "interview",
  "offer",
  "hired",
  "rejected",
]);

export const candidateSourceEnum = pgEnum("candidate_source", [
  "linkedin",
  "indeed",
  "glassdoor",
  "referral",
  "direct",
  "other",
]);

export const jobOpenings = pgTable("job_openings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  departmentId: integer("department_id").references(() => departments.id),
  locationId: integer("location_id").references(() => locations.id),
  hiringLeadId: integer("hiring_lead_id").references(() => employees.id),
  status: jobOpeningStatusEnum("status").default("draft").notNull(),
  employmentType: text("employment_type").notNull(), // full_time, part_time, contractor
  description: text("description"),
  requirements: text("requirements"),
  openDate: date("open_date"),
  closeDate: date("close_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const candidates = pgTable("candidates", {
  id: serial("id").primaryKey(),
  jobOpeningId: integer("job_opening_id")
    .notNull()
    .references(() => jobOpenings.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  resumeUrl: text("resume_url"),
  linkedinUrl: text("linkedin_url"),
  source: candidateSourceEnum("source").default("other").notNull(),
  stage: candidateStageEnum("stage").default("new").notNull(),
  rating: integer("rating"), // 1-5 stars
  appliedAt: timestamp("applied_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const candidateNotes = pgTable("candidate_notes", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  authorId: integer("author_id")
    .notNull()
    .references(() => employees.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const offerLetters = pgTable("offer_letters", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  jobTitle: text("job_title").notNull(),
  salary: decimal("salary", { precision: 12, scale: 2 }),
  startDate: date("start_date"),
  signedAt: timestamp("signed_at"),
  documentUrl: text("document_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jobOpeningsRelations = relations(jobOpenings, ({ one, many }) => ({
  department: one(departments, {
    fields: [jobOpenings.departmentId],
    references: [departments.id],
  }),
  location: one(locations, {
    fields: [jobOpenings.locationId],
    references: [locations.id],
  }),
  hiringLead: one(employees, {
    fields: [jobOpenings.hiringLeadId],
    references: [employees.id],
  }),
  candidates: many(candidates),
}));

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  jobOpening: one(jobOpenings, {
    fields: [candidates.jobOpeningId],
    references: [jobOpenings.id],
  }),
  notes: many(candidateNotes),
  offerLetter: one(offerLetters),
}));

export const candidateNotesRelations = relations(candidateNotes, ({ one }) => ({
  candidate: one(candidates, {
    fields: [candidateNotes.candidateId],
    references: [candidates.id],
  }),
  author: one(employees, {
    fields: [candidateNotes.authorId],
    references: [employees.id],
  }),
}));

export const offerLettersRelations = relations(offerLetters, ({ one }) => ({
  candidate: one(candidates, {
    fields: [offerLetters.candidateId],
    references: [candidates.id],
  }),
}));
