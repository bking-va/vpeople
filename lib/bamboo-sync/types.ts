export type EmploymentStatus =
  | "full_time"
  | "part_time"
  | "contractor"
  | "on_leave"
  | "terminated";

export type AccessLevel =
  | "employee"
  | "manager"
  | "regional_view"
  | "global_view"
  | "full_admin";

export type Gender =
  | "male"
  | "female"
  | "non_binary"
  | "prefer_not_to_say"
  | "other";

export type BambooEmployeeRecord = {
  id: string | number;
  employeeNumber?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  workEmail?: string | null;
  homeEmail?: string | null;
  workPhone?: string | null;
  workPhoneExtension?: string | null;
  mobilePhone?: string | null;
  homePhone?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  division?: string | null;
  location?: string | null;
  hireDate?: string | null;
  originalHireDate?: string | null;
  terminationDate?: string | null;
  employmentHistoryStatus?: string | null;
  employmentStatus?: string | null;
  status?: string | null;
  supervisorEId?: string | number | null;
  supervisorId?: string | number | null;
  supervisor?: string | null;
  reportsTo?: string | null;
  supervisorEmail?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  maritalStatus?: string | null;
  nationality?: string | null;
  citizenship?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  country?: string | null;
  linkedIn?: string | null;
  twitterFeed?: string | null;
  lastChanged?: string | null;
  ssn?: string | null;
  sin?: string | null;
  nationalId?: string | null;
  nin?: string | null;
  passportNumber?: string | null;
  bankAccountNumber?: string | null;
  bankRoutingNumber?: string | null;
  payRate?: string | null;
  [key: string]: unknown;
};

export type MappedEmployee = {
  employeeNumber: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  email: string;
  personalEmail: string | null;
  workPhone: string | null;
  extension: string | null;
  mobilePhone: string | null;
  homePhone: string | null;
  jobTitle: string | null;
  departmentName: string | null;
  divisionName: string | null;
  locationName: string | null;
  hireDate: string | null;
  originalHireDate: string | null;
  terminationDate: string | null;
  employmentStatus: EmploymentStatus;
  accessLevel: AccessLevel;
  gender: Gender | null;
  birthDate: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  citizenship: string | null;
  addressStreet1: string | null;
  addressStreet2: string | null;
  addressCity: string | null;
  addressProvince: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  linkedInUrl: string | null;
  twitterUrl: string | null;
};

export type MappedEmergencyContact = {
  name: string;
  relationship: string | null;
  phone: string;
  alternatePhone: string | null;
  email: string | null;
  isPrimary: boolean;
};

export type MappedJobHistoryRow = {
  effectiveDate: string;
  jobTitle: string | null;
  departmentName: string | null;
  divisionName: string | null;
  locationName: string | null;
  reportsToBambooId: string | null;
  comment: string | null;
};

export type MappedStatusHistoryRow = {
  effectiveDate: string;
  status: EmploymentStatus;
  changeType: "hire" | "status_change" | "terminate";
  comment: string | null;
  terminationType: string | null;
};

export type MappedCompensationRow = {
  effectiveDate: string;
  payRate: string | null;
  payType: string | null;
  paySchedule: string | null;
  currency: string | null;
  changeReason: string | null;
  comment: string | null;
};

export type MappedEmployeeBundle = {
  bambooId: string;
  employee: MappedEmployee;
  supervisorBambooId: string | null;
  unmappedFields: string[];
};

export type SyncEmployeeRow = {
  id: number;
  bambooId: string | null;
  email: string;
  employeeNumber: string | null;
  firstName: string;
  lastName: string;
  accessLevel: AccessLevel;
  vendastaSub: string | null;
  userId: string | null;
  managerId: number | null;
  pendingSupervisorBambooId?: string | null;
};

export type BrendanSnapshot = {
  accessLevel: AccessLevel;
  vendastaSub: string | null;
  userId: string | null;
};

export type BambooChangedEmployee = {
  id: string;
  action: "Inserted" | "Updated" | "Deleted" | string;
  lastChanged?: string;
};

export type BambooSyncMode = "full" | "incremental";

export type TimeOffRequestStatus =
  | "pending"
  | "approved"
  | "denied"
  | "cancelled";

export type JobOpeningStatus =
  | "draft"
  | "open"
  | "on_hold"
  | "filled"
  | "canceled";

export type CandidateStage =
  | "new"
  | "phone_screen"
  | "interview"
  | "offer"
  | "hired"
  | "rejected";

export type CandidateSource =
  | "linkedin"
  | "indeed"
  | "glassdoor"
  | "referral"
  | "direct"
  | "other";

export type BambooSyncDatasetCounts = {
  timeOffRequests: number;
  jobOpenings: number;
  education: number;
  visas: number;
};

export type AtsDatasetCounts = {
  applications: number;
  answers: number;
  comments: number;
  statusHistory: number;
  resumes: number;
};

export type MappedAtsApplicationWrite = {
  bambooId: string;
  jobBambooId: string;
  jobTitle: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  linkedinUrl: string | null;
  source: CandidateSource;
  sourceDetail: string | null;
  stage: CandidateStage;
  bambooStatusId: string | null;
  bambooStatusLabel: string | null;
  rating: number | null;
  appliedAt: string | null;
  coverLetter: string | null;
  resumeBambooFileId: string | null;
};

export type MappedAtsAnswerWrite = {
  bambooQuestionId: string;
  question: string;
  answer: string | null;
};

export type MappedAtsCommentWrite = {
  bambooId: string;
  authorName: string | null;
  authorBambooId: string | null;
  content: string;
  commentedAt: string | null;
};

export type MappedAtsStatusHistoryWrite = {
  bambooEventId: string;
  bambooStatusId: string | null;
  statusLabel: string;
  changedAt: string | null;
  changedByName: string | null;
};

export type AtsSyncCheckpoint = {
  phase: "list" | "details" | "resumes" | "done";
  listPage: number;
  lastListId: string | null;
  lastDetailId: string | null;
  lastResumeId: string | null;
  listed: number;
  detailed: number;
  resumes: number;
  answers: number;
  comments: number;
  history: number;
  newSince: string | null;
  paginationComplete: boolean;
  detailsRequeued?: boolean;
};

export function compareBambooApplicationIds(a: string, b: string): number {
  const left = Number(a);
  const right = Number(b);
  if (Number.isFinite(left) && Number.isFinite(right)) {
    return left === right ? 0 : left < right ? -1 : 1;
  }
  return a.localeCompare(b);
}

export function laterBambooApplicationId(
  a: string | null | undefined,
  b: string | null | undefined
): string | null {
  const values = [a, b].filter((value): value is string => Boolean(value));
  if (values.length === 0) return null;
  return values.sort(compareBambooApplicationIds)[values.length - 1];
}

export function isNumericBambooApplicationId(value: string): boolean {
  return /^\d{1,18}$/.test(value);
}

export function isResumableAtsRun(
  status: unknown,
  checkpoint: unknown
): boolean {
  if (status === "running" || status === "checkpointed") return true;
  if (status !== "failed") return false;
  return Boolean(
    checkpoint &&
      typeof checkpoint === "object" &&
      !Array.isArray(checkpoint) &&
      Object.keys(checkpoint as Record<string, unknown>).length > 0
  );
}

export type BambooAtsSyncResult = {
  status: "success" | "skipped" | "failed" | "checkpointed";
  dryRun: boolean;
  kind: "ats_applications";
  mode: BambooSyncMode;
  datasetCounts: AtsDatasetCounts;
  checkpoint: AtsSyncCheckpoint;
  errorMessage?: string;
};

export type MappedTimeOffRequestWrite = {
  bambooId: string;
  employeeBambooId: string;
  typeName: string;
  typeBambooId: string | null;
  startDate: string;
  endDate: string;
  daysRequested: string;
  status: TimeOffRequestStatus;
  notes: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
};

export type MappedJobOpeningWrite = {
  bambooId: string;
  title: string;
  departmentName: string | null;
  locationName: string | null;
  hiringLeadBambooId: string | null;
  status: JobOpeningStatus;
  bambooStatusId: string | null;
  bambooStatusLabel: string | null;
  employmentType: string;
  description: string | null;
  requirements: string | null;
  openDate: string | null;
  closeDate: string | null;
};

export type MappedEducationWrite = {
  bambooId: string;
  employeeBambooId: string;
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
};

export type MappedVisaWrite = {
  bambooId: string;
  employeeBambooId: string;
  visaType: string;
  country: string;
  documentNumber: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  status: string;
};

export type BambooSyncResult = {
  status: "success" | "skipped" | "failed";
  dryRun: boolean;
  fetched: number;
  created: number;
  updated: number;
  reportsToResolved: number;
  demoRemoved: number;
  brendanAdminBound: boolean;
  unmappedFields: string[];
  bambooIds: string[];
  writes: number;
  latestChanged: string | null;
  datasetCounts: BambooSyncDatasetCounts;
  errorMessage?: string;
};
