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
  errorMessage?: string;
};
