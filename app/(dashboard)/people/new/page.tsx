import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  departments,
  divisions,
  locations,
  jobFamilies,
  jobLevels,
  employees,
  candidates,
  jobOpenings,
  offerLetters,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NewEmployeeWizard } from "@/components/new-employee-wizard";
import { getUserPermissions } from "@/lib/permissions";
import { isFullAdmin } from "@/lib/authz";
import { hiringAccessForCandidate } from "@/lib/hiring-access";
import { canOpenEmployeeCreate, safeHirePrefill } from "@/lib/hire-employee";
import { employeeInScope, scopedEmployeeIds } from "@/lib/employee-scope";

export default async function NewEmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ candidateId?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id || !session.user.email) {
    redirect("/");
  }

  const employeeId = session.user.employeeId;
  if (!employeeId) {
    redirect("/people");
  }

  const [currentEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!currentEmployee) {
    redirect("/people");
  }

  const permissions = await getUserPermissions(session.user.email);
  const isHrOrAdmin =
    isFullAdmin(currentEmployee.accessLevel) || permissions.canManageUsers === true;

  const { candidateId: candidateIdParam } = await searchParams;
  const candidateId = candidateIdParam ? parseInt(candidateIdParam, 10) : NaN;
  const fromCandidate = Number.isFinite(candidateId);

  let prefill: ReturnType<typeof safeHirePrefill> | undefined;
  let candidateLabel: string | undefined;

  if (fromCandidate) {
    const access = await hiringAccessForCandidate(session.user.email, candidateId);
    if (access.notFound) {
      notFound();
    }
    if (
      !canOpenEmployeeCreate({
        isHrOrAdmin,
        fromHiredCandidate: true,
        hiringAllowed: access.allowed,
      })
    ) {
      redirect("/hiring");
    }

    const [row] = await db
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        phone: candidates.phone,
        linkedinUrl: candidates.linkedinUrl,
        resumeUrl: candidates.resumeUrl,
        rating: candidates.rating,
        stage: candidates.stage,
        employeeId: candidates.employeeId,
        openingTitle: jobOpenings.title,
        departmentId: jobOpenings.departmentId,
        locationId: jobOpenings.locationId,
        employmentType: jobOpenings.employmentType,
        offerJobTitle: offerLetters.jobTitle,
        offerStartDate: offerLetters.startDate,
      })
      .from(candidates)
      .leftJoin(jobOpenings, eq(candidates.jobOpeningId, jobOpenings.id))
      .leftJoin(offerLetters, eq(offerLetters.candidateId, candidates.id))
      .where(eq(candidates.id, candidateId))
      .limit(1);

    if (!row || row.stage !== "hired") {
      notFound();
    }
    if (row.employeeId) {
      redirect(`/people/${row.employeeId}`);
    }

    prefill = safeHirePrefill({
      candidate: {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        linkedinUrl: row.linkedinUrl,
        resumeUrl: row.resumeUrl,
        rating: row.rating,
      },
      opening: {
        title: row.openingTitle,
        departmentId: row.departmentId,
        locationId: row.locationId,
        employmentType: row.employmentType,
      },
      offer: {
        jobTitle: row.offerJobTitle,
        startDate: row.offerStartDate,
        salary: null,
      },
    });
    candidateLabel = `${row.firstName} ${row.lastName}`;
  } else if (
    !canOpenEmployeeCreate({
      isHrOrAdmin,
      fromHiredCandidate: false,
      hiringAllowed: false,
    })
  ) {
    redirect("/people");
  }

  const allowed = await scopedEmployeeIds({
    employeeId: currentEmployee.id,
    accessLevel: currentEmployee.accessLevel,
    canManageUsers: permissions.canManageUsers,
  });

  const [
    allDepartments,
    allDivisions,
    allLocations,
    allJobFamilies,
    allJobLevels,
    managerRows,
  ] = await Promise.all([
    db.select().from(departments).orderBy(departments.name),
    db.select().from(divisions).orderBy(divisions.name),
    db.select().from(locations).orderBy(locations.name),
    db.select().from(jobFamilies).orderBy(jobFamilies.name),
    db.select().from(jobLevels).orderBy(jobLevels.code),
    db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        jobTitle: employees.jobTitle,
      })
      .from(employees)
      .where(eq(employees.employmentStatus, "full_time"))
      .orderBy(employees.lastName),
  ]);

  const potentialManagers = managerRows.filter((row) =>
    employeeInScope(row.id, allowed)
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-bold">Add New Employee</h1>
        <p className="text-muted-foreground">
          {prefill
            ? `Prefilling from hired candidate ${candidateLabel}. Login is not provisioned.`
            : "Complete the wizard to onboard a new employee"}
        </p>
      </div>

      <NewEmployeeWizard
        departments={allDepartments}
        divisions={allDivisions}
        locations={allLocations}
        jobFamilies={allJobFamilies}
        jobLevels={allJobLevels}
        managers={potentialManagers}
        initialValues={prefill}
        candidateId={prefill?.candidateId}
        canSetAccessLevel={isHrOrAdmin}
      />
    </div>
  );
}
