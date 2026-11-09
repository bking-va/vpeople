import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  employees,
  departments,
  divisions,
  locations,
  jobFamilies,
  jobLevels,
  jobHistory,
  compensationHistory,
  bonusDetails,
  equityGrants,
  timeOffBalances,
  timeOffPolicies,
  timeOffRequests,
  timeOffBalanceAdjustments,
  employmentStatusHistory,
  emergencyContacts,
  employeeNotes,
  employeeTasks,
  employeeTeams,
  teams,
  documents,
  employeeEducation,
  employeeVisas,
} from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency, calculateTenure } from "@/lib/utils";
import { formatEmploymentStatus } from "@/lib/utils/formatters";
import { auth } from "@/lib/auth";
import { getUserPermissions } from "@/lib/permissions";
import {
  canViewImmigrationNumbers,
  canViewPrivateDocuments,
  canViewTimeOffLedger,
  redactVisaDocumentNumber,
  visibleProfileEmail,
} from "@/lib/authz";
import Link from "next/link";
import { ProfileDocuments } from "@/components/profile-documents";
import { CustomFieldsDisplay } from "@/components/custom-fields-display";
import { CompensationEditForm } from "@/components/compensation-edit-form";
import { JobInfoEditForm } from "@/components/job-info-edit-form";
import { EmploymentStatusForm } from "@/components/employment-status-form";
import { PromotionForm } from "@/components/promotion-form";
import { Button } from "@/components/ui/button";

export default async function EmployeeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const { id } = await params;
  const { tab } = await searchParams;
  const employeeId = parseInt(id);

  if (isNaN(employeeId)) {
    notFound();
  }

  // Only select safe fields initially (exclude sin, ssn, etc.)
  const [employee] = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      userId: employees.userId,
      firstName: employees.firstName,
      middleName: employees.middleName,
      lastName: employees.lastName,
      preferredName: employees.preferredName,
      email: employees.email,
      personalEmail: employees.personalEmail,
      workPhone: employees.workPhone,
      mobilePhone: employees.mobilePhone,
      homePhone: employees.homePhone,
      extension: employees.extension,
      jobTitle: employees.jobTitle,
      departmentId: employees.departmentId,
      divisionId: employees.divisionId,
      locationId: employees.locationId,
      managerId: employees.managerId,
      hireDate: employees.hireDate,
      originalHireDate: employees.originalHireDate,
      employmentStatus: employees.employmentStatus,
      terminationDate: employees.terminationDate,
      terminationType: employees.terminationType,
      roeCode: employees.roeCode,
      jobFamilyId: employees.jobFamilyId,
      jobLevelId: employees.jobLevelId,
      accessLevel: employees.accessLevel,
      photoUrl: employees.photoUrl,
      linkedInUrl: employees.linkedInUrl,
      twitterUrl: employees.twitterUrl,
      githubUrl: employees.githubUrl,
      addressStreet1: employees.addressStreet1,
      addressStreet2: employees.addressStreet2,
      addressCity: employees.addressCity,
      addressProvince: employees.addressProvince,
      addressPostalCode: employees.addressPostalCode,
      addressCountry: employees.addressCountry,
      birthDate: employees.birthDate,
      gender: employees.gender,
      maritalStatus: employees.maritalStatus,
      nationality: employees.nationality,
      citizenship: employees.citizenship,
      dietaryRestrictions: employees.dietaryRestrictions,
      tshirtSize: employees.tshirtSize,
      createdAt: employees.createdAt,
      updatedAt: employees.updatedAt,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee) {
    notFound();
  }

  const [dept, div, loc, family, level, manager] = await Promise.all([
    employee.departmentId
      ? db.select().from(departments).where(eq(departments.id, employee.departmentId)).limit(1)
      : Promise.resolve([null]),
    employee.divisionId
      ? db.select().from(divisions).where(eq(divisions.id, employee.divisionId)).limit(1)
      : Promise.resolve([null]),
    employee.locationId
      ? db.select().from(locations).where(eq(locations.id, employee.locationId)).limit(1)
      : Promise.resolve([null]),
    employee.jobFamilyId
      ? db.select().from(jobFamilies).where(eq(jobFamilies.id, employee.jobFamilyId)).limit(1)
      : Promise.resolve([null]),
    employee.jobLevelId
      ? db.select().from(jobLevels).where(eq(jobLevels.id, employee.jobLevelId)).limit(1)
      : Promise.resolve([null]),
      employee.managerId
      ? db
          .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
          })
          .from(employees)
          .where(eq(employees.id, employee.managerId))
          .limit(1)
      : Promise.resolve([null]),
  ]);

  const directReports = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      preferredName: employees.preferredName,
      email: employees.email,
      jobTitle: employees.jobTitle,
    })
    .from(employees)
    .where(eq(employees.managerId, employeeId));

  const jobHistoryRecords = await db
    .select()
    .from(jobHistory)
    .where(eq(jobHistory.employeeId, employeeId))
    .orderBy(desc(jobHistory.effectiveDate));

  const isViewingSelf = session.user.employeeId === employeeId;
  const isManager = employee.managerId === session.user.employeeId;

  // Get DB-backed permissions
  const permissions = await getUserPermissions(session.user.email!);
  
  // Allow viewing own data or use DB permissions
  const canViewCompensation = isViewingSelf || permissions.canViewCompensation;
  const canEditCompensation = permissions.canEditCompensation;
  const canViewSensitivePersonalInfo = isViewingSelf || permissions.canViewSensitivePersonalInfo;
  const canEditEmployee = isViewingSelf || permissions.canManageUsers;
  const displayEmail = visibleProfileEmail(employee.email, {
    isViewingSelf,
    canViewSensitivePersonalInfo: permissions.canViewSensitivePersonalInfo,
  });
  const displayPersonalEmail = visibleProfileEmail(employee.personalEmail, {
    isViewingSelf,
    canViewSensitivePersonalInfo: permissions.canViewSensitivePersonalInfo,
  });

  // Only query sensitive personal info if authorized
  const sensitivePersonalInfo = canViewSensitivePersonalInfo
    ? await db
        .select({
          sin: employees.sin,
          ssn: employees.ssn,
        })
        .from(employees)
        .where(eq(employees.id, employeeId))
        .limit(1)
        .then((rows) => rows[0] || { sin: null, ssn: null })
    : { sin: null, ssn: null };

  const [compHistory, bonuses, equity] = canViewCompensation
    ? await Promise.all([
        db.select().from(compensationHistory).where(eq(compensationHistory.employeeId, employeeId)).orderBy(desc(compensationHistory.effectiveDate)),
        db.select().from(bonusDetails).where(eq(bonusDetails.employeeId, employeeId)).orderBy(desc(bonusDetails.effectiveDate)),
        db.select().from(equityGrants).where(eq(equityGrants.employeeId, employeeId)).orderBy(desc(equityGrants.grantDate)),
      ])
    : [[], [], []];

  let viewerAccessLevel = isViewingSelf ? employee.accessLevel : null;
  if (!viewerAccessLevel && session.user.employeeId) {
    const [viewer] = await db
      .select({ accessLevel: employees.accessLevel })
      .from(employees)
      .where(eq(employees.id, session.user.employeeId))
      .limit(1);
    viewerAccessLevel = viewer?.accessLevel ?? null;
  }

  const canViewLedger = canViewTimeOffLedger({
    isViewingSelf,
    isManager,
    canManageUsers: permissions.canManageUsers,
    accessLevel: viewerAccessLevel,
  });

  const timeOffData = await db
    .select({
      balance: timeOffBalances,
      policy: timeOffPolicies,
    })
    .from(timeOffBalances)
    .leftJoin(timeOffPolicies, eq(timeOffBalances.policyId, timeOffPolicies.id))
    .where(eq(timeOffBalances.employeeId, employeeId));

  const balanceIds = timeOffData.map((item) => item.balance.id);
  const balanceAdjustments =
    canViewLedger && balanceIds.length
      ? await db
          .select({
            id: timeOffBalanceAdjustments.id,
            balanceId: timeOffBalanceAdjustments.balanceId,
            amount: timeOffBalanceAdjustments.amount,
            reason: timeOffBalanceAdjustments.reason,
            createdAt: timeOffBalanceAdjustments.createdAt,
          })
          .from(timeOffBalanceAdjustments)
          .where(inArray(timeOffBalanceAdjustments.balanceId, balanceIds))
          .orderBy(desc(timeOffBalanceAdjustments.createdAt))
      : [];

  const requests = await db
    .select()
    .from(timeOffRequests)
    .where(eq(timeOffRequests.employeeId, employeeId))
    .orderBy(desc(timeOffRequests.createdAt))
    .limit(10);

  const contacts = await db
    .select()
    .from(emergencyContacts)
    .where(eq(emergencyContacts.employeeId, employeeId));

  const tasks = await db
    .select()
    .from(employeeTasks)
    .where(eq(employeeTasks.employeeId, employeeId))
    .orderBy(employeeTasks.createdAt);

  const statusHistoryRecords = canViewLedger
    ? await db
        .select()
        .from(employmentStatusHistory)
        .where(eq(employmentStatusHistory.employeeId, employeeId))
        .orderBy(desc(employmentStatusHistory.effectiveDate), desc(employmentStatusHistory.id))
    : [];

  const canViewDocs = canViewPrivateDocuments({
    isViewingSelf,
    canManageUsers: permissions.canManageUsers,
    accessLevel: viewerAccessLevel,
  });
  const employeeDocs = canViewDocs
    ? await db
        .select()
        .from(documents)
        .where(eq(documents.employeeId, employeeId))
        .orderBy(desc(documents.createdAt))
    : [];

  const educationRows = await db
    .select()
    .from(employeeEducation)
    .where(eq(employeeEducation.employeeId, employeeId))
    .orderBy(desc(employeeEducation.endDate));

  const canSeeVisaNumbers = canViewImmigrationNumbers({
    isViewingSelf,
    canViewSensitivePersonalInfo,
  });
  const visaPublicFields = {
    id: employeeVisas.id,
    visaType: employeeVisas.visaType,
    country: employeeVisas.country,
    status: employeeVisas.status,
    issuedDate: employeeVisas.issuedDate,
    expiryDate: employeeVisas.expiryDate,
  };
  const visaRows = canSeeVisaNumbers
    ? await db
        .select({
          ...visaPublicFields,
          documentNumber: employeeVisas.documentNumber,
        })
        .from(employeeVisas)
        .where(eq(employeeVisas.employeeId, employeeId))
        .orderBy(desc(employeeVisas.expiryDate))
    : (
        await db
          .select(visaPublicFields)
          .from(employeeVisas)
          .where(eq(employeeVisas.employeeId, employeeId))
          .orderBy(desc(employeeVisas.expiryDate))
      ).map((row) => redactVisaDocumentNumber({ ...row, documentNumber: null }, false));

  const employeeTeamsList = await db
    .select({ team: teams })
    .from(employeeTeams)
    .leftJoin(teams, eq(employeeTeams.teamId, teams.id))
    .where(eq(employeeTeams.employeeId, employeeId));

  const displayName = employee.preferredName
    ? `${employee.preferredName} ${employee.lastName}`
    : `${employee.firstName} ${employee.lastName}`;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{displayName}</h1>
          <p className="text-muted-foreground">{employee.jobTitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{formatEmploymentStatus(employee.employmentStatus)}</Badge>
          {permissions.canManageUsers && employee.employmentStatus !== "terminated" && (
            <Link href={`/people/${employee.id}/terminate`}>
              <Button variant="destructive" size="sm">Terminate</Button>
            </Link>
          )}
          {permissions.canManageUsers && employee.employmentStatus === "terminated" && (
            <Link href={`/people/${employee.id}/rehire`}>
              <Button size="sm">Rehire</Button>
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Employee #</p>
              <p className="font-medium">{employee.employeeNumber}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Department</p>
              <p className="font-medium">{dept[0]?.name || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Location</p>
              <p className="font-medium">{loc[0]?.name || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Manager</p>
              {manager[0] ? (
                <Link
                  href={`/people/${manager[0].id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {manager[0].firstName} {manager[0].lastName}
                </Link>
              ) : (
                <p className="font-medium">—</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Hire Date</p>
              <p className="font-medium">{formatDate(employee.hireDate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Tenure</p>
              <p className="font-medium">{calculateTenure(employee.hireDate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Direct Reports</p>
              <p className="font-medium">{directReports.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Email</p>
              {displayEmail ? (
              <a
                href={`mailto:${displayEmail}`}
                className="font-medium text-primary hover:underline truncate block"
              >
                {displayEmail}
              </a>
              ) : (
                <p className="font-medium">—</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={tab || "personal"} className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="job">Job</TabsTrigger>
          {canViewCompensation && (
            <TabsTrigger value="compensation">Compensation</TabsTrigger>
          )}
          <TabsTrigger value="time-off">Time Off</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="benefits">Benefits</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="emergency">Emergency</TabsTrigger>
          <TabsTrigger value="tasks">Onboarding/Offboarding</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <InfoField label="First Name" value={employee.firstName} />
              <InfoField label="Last Name" value={employee.lastName} />
              <InfoField label="Middle Name" value={employee.middleName} />
              <InfoField label="Preferred Name" value={employee.preferredName} />
              <InfoField label="Birth Date" value={formatDate(employee.birthDate)} />
              <InfoField label="Gender" value={employee.gender} />
              <InfoField label="Marital Status" value={employee.maritalStatus} />
              <InfoField label="Nationality" value={employee.nationality} />
              <InfoField label="Citizenship" value={employee.citizenship} />
              {canViewSensitivePersonalInfo && <InfoField label="SIN" value={sensitivePersonalInfo.sin} />}
              {canViewSensitivePersonalInfo && <InfoField label="SSN" value={sensitivePersonalInfo.ssn} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Address</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <InfoField label="Street 1" value={employee.addressStreet1} />
              <InfoField label="Street 2" value={employee.addressStreet2} />
              <InfoField label="City" value={employee.addressCity} />
              <InfoField label="Province/State" value={employee.addressProvince} />
              <InfoField label="Postal Code" value={employee.addressPostalCode} />
              <InfoField label="Country" value={employee.addressCountry} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <InfoField label="Work Phone" value={employee.workPhone} />
              <InfoField label="Extension" value={employee.extension} />
              <InfoField label="Mobile Phone" value={employee.mobilePhone} />
              <InfoField label="Home Phone" value={employee.homePhone} />
              <InfoField label="Personal Email" value={displayPersonalEmail} />
              <InfoField label="LinkedIn" value={employee.linkedInUrl} />
              <InfoField label="Twitter" value={employee.twitterUrl} />
              <InfoField label="GitHub" value={employee.githubUrl} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Education</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {educationRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No education records</p>
              ) : (
                educationRows.map((row) => (
                  <div key={row.id} className="border rounded-lg p-3 text-sm space-y-1">
                    <p className="font-medium">{row.institution}</p>
                    <p className="text-muted-foreground">
                      {[row.degree, row.fieldOfStudy].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.startDate || "—"} – {row.endDate || "present"}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Visa / Work Authorization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {visaRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No visa records</p>
              ) : (
                visaRows.map((row) => (
                  <div key={row.id} className="border rounded-lg p-3 text-sm grid md:grid-cols-2 gap-2">
                    <InfoField label="Type" value={row.visaType} />
                    <InfoField label="Country" value={row.country} />
                    {canSeeVisaNumbers && (
                      <InfoField label="Document #" value={row.documentNumber} />
                    )}
                    <InfoField label="Status" value={row.status} />
                    <InfoField label="Issued" value={formatDate(row.issuedDate)} />
                    <InfoField label="Expires" value={formatDate(row.expiryDate)} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <CustomFieldsDisplay
                section="personal"
                entityId={employee.id}
                canEdit={canEditEmployee}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="job" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Job Information</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <InfoField label="Job Title" value={employee.jobTitle} />
              <InfoField label="Department" value={dept[0]?.name} />
              <InfoField label="Division" value={div[0]?.name} />
              <InfoField label="Location" value={loc[0]?.name} />
              <InfoField label="Job Family" value={family[0]?.name} />
              <InfoField label="Job Level" value={level[0]?.code} />
              <InfoField label="Employment Status" value={formatEmploymentStatus(employee.employmentStatus)} />
              <InfoField label="Hire Date" value={formatDate(employee.hireDate)} />
              {employee.originalHireDate && employee.originalHireDate !== employee.hireDate && (
                <InfoField label="Original Hire Date" value={formatDate(employee.originalHireDate)} />
              )}
              {employee.terminationDate && (
                <InfoField
                  label="Termination Date"
                  value={formatDate(employee.terminationDate)}
                />
              )}
              {employee.roeCode && (
                <InfoField label="Canadian ROE code" value={employee.roeCode} />
              )}
              {employee.terminationType && (
                <InfoField label="Termination type" value={employee.terminationType} />
              )}
            </CardContent>
          </Card>

          {employeeTeamsList.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Teams</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {employeeTeamsList.map((t) => (
                    <Badge key={t.team?.id} variant="secondary">
                      {t.team?.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {statusHistoryRecords.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Employment Status History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {statusHistoryRecords.map((record) => (
                    <div key={record.id} className="border-l-2 border-primary pl-4">
                      <p className="text-sm text-muted-foreground">
                        {formatDate(record.effectiveDate)}
                      </p>
                      <p className="font-medium">{formatEmploymentStatus(record.status)}</p>
                      {record.changeType && (
                        <p className="text-xs text-muted-foreground capitalize">
                          {record.changeType.replace("_", " ")}
                        </p>
                      )}
                      {record.comment && (
                        <p className="text-sm text-muted-foreground">{record.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {jobHistoryRecords.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Job History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {jobHistoryRecords.map((record) => (
                    <div key={record.id} className="border-l-2 border-primary pl-4">
                      <p className="text-sm text-muted-foreground">
                        {formatDate(record.effectiveDate)}
                      </p>
                      <p className="font-medium">{record.jobTitle}</p>
                      {record.comment && (
                        <p className="text-sm text-muted-foreground">{record.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent>
              <CustomFieldsDisplay
                section="job"
                entityId={employee.id}
                canEdit={canEditEmployee}
              />
            </CardContent>
          </Card>

          {canEditEmployee && (
            <JobInfoEditForm
              employeeId={employee.id}
              canEdit={canEditEmployee}
              currentData={{
                jobTitle: employee.jobTitle || undefined,
                departmentId: employee.departmentId || undefined,
                divisionId: employee.divisionId || undefined,
                locationId: employee.locationId || undefined,
                managerId: employee.managerId || undefined,
                employmentStatus: employee.employmentStatus,
                jobFamilyId: employee.jobFamilyId || undefined,
                jobLevelId: employee.jobLevelId || undefined,
              }}
            />
          )}
          {permissions.canManageUsers && (
            <>
              <EmploymentStatusForm
                employeeId={employee.id}
                currentStatus={employee.employmentStatus}
              />
              {employee.employmentStatus !== "terminated" && (
                <PromotionForm
                  employeeId={employee.id}
                  currentTitle={employee.jobTitle}
                />
              )}
            </>
          )}
        </TabsContent>

        {canViewCompensation && (
          <TabsContent value="compensation" className="space-y-4">
            {compHistory.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Compensation History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {compHistory.map((record) => (
                      <div key={record.id} className="border-l-2 border-primary pl-4">
                        <p className="text-sm text-muted-foreground">
                          {formatDate(record.effectiveDate)}
                        </p>
                        <p className="font-medium">
                          {record.payRate ? formatCurrency(record.payRate, record.currency || "CAD") : "—"} {record.payType}
                        </p>
                        {record.changeReason && (
                          <p className="text-sm text-muted-foreground">
                            {record.changeReason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {bonuses.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Bonus Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {bonuses.map((record) => (
                      <div key={record.id} className="border-l-2 border-primary pl-4">
                        <p className="text-sm text-muted-foreground">
                          {formatDate(record.effectiveDate)}
                        </p>
                        <p className="font-medium">
                          {record.bonusType}: {record.eligibleAmount ? formatCurrency(record.eligibleAmount, record.currency || "CAD") : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {equity.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Equity Grants</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {equity.map((record) => (
                      <div key={record.id} className="border-l-2 border-primary pl-4">
                        <p className="text-sm text-muted-foreground">
                          {formatDate(record.grantDate)}
                        </p>
                        <p className="font-medium">
                          {record.grantType}: {record.sharesGranted} shares
                        </p>
                        {record.vestingSchedule && (
                          <p className="text-sm text-muted-foreground">
                            Vesting: {record.vestingSchedule}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <CompensationEditForm
              employeeId={employee.id}
              canEdit={canEditCompensation}
            />
          </TabsContent>
        )}

        <TabsContent value="time-off" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            {timeOffData.map((item) => (
              <Card key={item.balance.id}>
                <CardHeader>
                  <CardTitle className="text-base">{item.policy?.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {parseFloat(item.balance.balance).toFixed(1)} days
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {item.policy?.policyType}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {balanceAdjustments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Balance History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {balanceAdjustments.map((row) => {
                    const policyName =
                      timeOffData.find((item) => item.balance.id === row.balanceId)?.policy?.name ||
                      "Time off";
                    const amount = parseFloat(row.amount);
                    return (
                      <div key={row.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                        <div>
                          <p className="font-medium">{policyName}</p>
                          <p className="text-sm text-muted-foreground">
                            {row.reason} · {formatDate(row.createdAt)}
                          </p>
                        </div>
                        <span className={amount < 0 ? "text-destructive" : "text-emerald-700"}>
                          {amount > 0 ? "+" : ""}
                          {amount.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {requests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Time Off Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {requests.map((request) => (
                    <div key={request.id} className="flex items-center justify-between border-b pb-2">
                      <div>
                        <p className="font-medium">
                          {formatDate(request.startDate)} - {formatDate(request.endDate)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {request.daysRequested} days
                        </p>
                        {request.notes && (
                          <p className="text-sm text-muted-foreground">{request.notes}</p>
                        )}
                      </div>
                      <Badge
                        variant={
                          request.status === "approved"
                            ? "default"
                            : request.status === "pending"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {request.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="emergency" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Emergency Contacts</CardTitle>
            </CardHeader>
            <CardContent>
              {contacts.length > 0 ? (
                <div className="space-y-4">
                  {contacts.map((contact) => (
                    <div key={contact.id} className="border-b pb-4 last:border-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{contact.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {contact.relationship}
                          </p>
                        </div>
                        {contact.isPrimary && (
                          <Badge variant="secondary">Primary</Badge>
                        )}
                      </div>
                      <div className="mt-2 space-y-1 text-sm">
                        <p>Phone: {contact.phone}</p>
                        {contact.alternatePhone && (
                          <p>Alt Phone: {contact.alternatePhone}</p>
                        )}
                        {contact.email && <p>Email: {contact.email}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No emergency contacts on file</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          {tasks.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between border-b pb-2">
                      <div>
                        <p className="font-medium">{task.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {task.taskType} • Due: {formatDate(task.dueDate)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          task.status === "completed"
                            ? "default"
                            : task.status === "in_progress"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {task.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-center">No tasks assigned</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <ProfileDocuments
            employeeId={employeeId}
            documents={employeeDocs.map(doc => ({
              id: doc.id,
              title: doc.title,
              category: doc.category,
              status: doc.status,
              signedAt: doc.signedAt ? doc.signedAt.toISOString() : null,
              createdAt: doc.createdAt.toISOString(),
            }))}
            canUpload={canViewCompensation}
          />
        </TabsContent>

        <TabsContent value="training" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Training & Certifications</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Training records coming soon. Will track required training, certifications, and completion dates.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="benefits" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Benefits</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Benefits enrollment coming soon. Will include policy numbers, member IDs, and dependent information.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Assets & Equipment</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Asset tracking coming soon. Will include company equipment, credit cards, and other assigned assets.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}
