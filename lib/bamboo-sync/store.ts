import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import {
  announcements,
  approvalRequestSteps,
  approvalRequests,
  auditLogs,
  bambooSyncRuns,
  candidateNotes,
  compensationHistory,
  customFieldValues,
  departments,
  divisions,
  documents,
  emergencyContacts,
  employeeNotes,
  employeeTasks,
  employees,
  employmentStatusHistory,
  jobHistory,
  jobOpenings,
  jobTitles,
  locations,
  seats,
  timeOffBalanceAdjustments,
  timeOffBalances,
  timeOffPolicies,
  timeOffRequests,
  timesheets,
} from "@/lib/db/schema";
import {
  rebindPendingManagerApprovals,
  unassignPendingManagerApprovals,
} from "@/lib/approvals";
import { isBrendanWorkEmail } from "./map";
import { DEMO_SEED_EMAILS, isDemoEmployee } from "./demo";
import type { BambooSyncStore } from "./sync";
import type {
  AccessLevel,
  BrendanSnapshot,
  MappedEmployee,
  SyncEmployeeRow,
} from "./types";

type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  delete: (...args: any[]) => any;
  transaction?: <T>(fn: (tx: any) => Promise<T>) => Promise<T>;
};

function asAccessLevel(value: string | null | undefined): AccessLevel {
  if (
    value === "manager" ||
    value === "regional_view" ||
    value === "global_view" ||
    value === "full_admin"
  ) {
    return value;
  }
  return "employee";
}

function toSyncRow(row: {
  id: number;
  bambooId: string | null;
  email: string;
  employeeNumber: string | null;
  firstName: string;
  lastName: string;
  accessLevel: string;
  vendastaSub: string | null;
  userId: string | null;
  managerId: number | null;
}): SyncEmployeeRow {
  return {
    id: row.id,
    bambooId: row.bambooId,
    email: row.email,
    employeeNumber: row.employeeNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    accessLevel: asAccessLevel(row.accessLevel),
    vendastaSub: row.vendastaSub,
    userId: row.userId,
    managerId: row.managerId,
  };
}

async function findByName(
  db: DbLike,
  table: typeof departments | typeof divisions | typeof locations | typeof jobTitles,
  column: any,
  name: string
) {
  const [row] = await db
    .select()
    .from(table)
    .where(sql`lower(${column}) = ${name.toLowerCase()}`)
    .limit(1);
  return row ?? null;
}

export function createBambooSyncStore(db: DbLike): BambooSyncStore {
  const store: BambooSyncStore = {
    async listEmployees() {
      const rows = await db
        .select({
          id: employees.id,
          bambooId: employees.bambooId,
          email: employees.email,
          employeeNumber: employees.employeeNumber,
          firstName: employees.firstName,
          lastName: employees.lastName,
          accessLevel: employees.accessLevel,
          vendastaSub: employees.vendastaSub,
          userId: employees.userId,
          managerId: employees.managerId,
        })
        .from(employees);
      return rows.map(toSyncRow);
    },

    async replaceDemoEmployees() {
      const all = await store.listEmployees();
      const demo = all.filter(isDemoEmployee);
      const brendan =
        demo.find(
          (row) => row.employeeNumber === "E001" || isBrendanWorkEmail(row.email)
        ) ?? null;
      const snapshot: BrendanSnapshot | null = brendan
        ? {
            accessLevel: brendan.accessLevel,
            vendastaSub: brendan.vendastaSub,
            userId: brendan.userId,
          }
        : null;
      const ids = demo.map((row) => row.id);
      if (ids.length === 0) {
        return { removed: 0, brendanSnapshot: snapshot };
      }

      await db
        .update(employees)
        .set({ managerId: null, updatedAt: new Date() })
        .where(inArray(employees.managerId, ids));
      await db
        .update(jobHistory)
        .set({ managerId: null })
        .where(inArray(jobHistory.managerId, ids));
      await db
        .update(employmentStatusHistory)
        .set({ recordedById: null })
        .where(inArray(employmentStatusHistory.recordedById, ids));
      await db
        .update(employeeTasks)
        .set({ assignedToId: null })
        .where(inArray(employeeTasks.assignedToId, ids));
      await db.delete(jobOpenings).where(inArray(jobOpenings.hiringLeadId, ids));
      await db
        .update(seats)
        .set({ assignedEmployeeId: null, updatedAt: new Date() })
        .where(inArray(seats.assignedEmployeeId, ids));
      await db
        .update(documents)
        .set({ signedBy: null, updatedAt: new Date() })
        .where(inArray(documents.signedBy, ids));
      await db
        .update(timeOffRequests)
        .set({ reviewedBy: null, updatedAt: new Date() })
        .where(inArray(timeOffRequests.reviewedBy, ids));
      await db
        .update(timesheets)
        .set({ reviewedBy: null, updatedAt: new Date() })
        .where(inArray(timesheets.reviewedBy, ids));
      await db
        .update(announcements)
        .set({ publishedById: null, updatedAt: new Date() })
        .where(inArray(announcements.publishedById, ids));
      await db.delete(documents).where(inArray(documents.uploadedBy, ids));
      await db.delete(employeeNotes).where(
        or(inArray(employeeNotes.employeeId, ids), inArray(employeeNotes.authorId, ids))
      );
      await db.delete(candidateNotes).where(inArray(candidateNotes.authorId, ids));
      await db
        .delete(approvalRequestSteps)
        .where(inArray(approvalRequestSteps.approverId, ids));
      await db
        .delete(approvalRequests)
        .where(inArray(approvalRequests.requesterId, ids));
      await db
        .delete(timeOffBalanceAdjustments)
        .where(inArray(timeOffBalanceAdjustments.adjustedBy, ids));
      await db.delete(auditLogs).where(inArray(auditLogs.employeeId, ids));
      await db.delete(customFieldValues).where(inArray(customFieldValues.entityId, ids));

      await db.delete(employees).where(inArray(employees.id, ids));
      return { removed: ids.length, brendanSnapshot: snapshot };
    },

    async upsertOrgUnit(kind, name) {
      const trimmed = name.trim();
      if (!trimmed) return null;
      if (kind === "department") {
        const existing = await findByName(db, departments, departments.name, trimmed);
        if (existing) return existing.id;
        const [created] = await db
          .insert(departments)
          .values({ name: trimmed })
          .onConflictDoNothing()
          .returning();
        if (created) return created.id;
        const again = await findByName(db, departments, departments.name, trimmed);
        return again?.id ?? null;
      }
      if (kind === "division") {
        const existing = await findByName(db, divisions, divisions.name, trimmed);
        if (existing) return existing.id;
        const [created] = await db
          .insert(divisions)
          .values({ name: trimmed })
          .onConflictDoNothing()
          .returning();
        if (created) return created.id;
        const again = await findByName(db, divisions, divisions.name, trimmed);
        return again?.id ?? null;
      }
      if (kind === "location") {
        const existing = await findByName(db, locations, locations.name, trimmed);
        if (existing) return existing.id;
        const [created] = await db
          .insert(locations)
          .values({ name: trimmed, country: "Unknown" })
          .returning();
        return created?.id ?? null;
      }
      const existing = await findByName(db, jobTitles, jobTitles.title, trimmed);
      if (existing) return existing.id;
      const [created] = await db
        .insert(jobTitles)
        .values({ title: trimmed })
        .onConflictDoNothing()
        .returning();
      if (created) return created.id;
      const again = await findByName(db, jobTitles, jobTitles.title, trimmed);
      return again?.id ?? null;
    },

    async upsertEmployee(bambooId, employee) {
      const departmentId = employee.departmentName
        ? await store.upsertOrgUnit("department", employee.departmentName)
        : null;
      const divisionId = employee.divisionName
        ? await store.upsertOrgUnit("division", employee.divisionName)
        : null;
      const locationId = employee.locationName
        ? await store.upsertOrgUnit("location", employee.locationName)
        : null;

      const [byBamboo] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.bambooId, bambooId))
        .limit(1);

      const values = {
        bambooId,
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        middleName: employee.middleName,
        lastName: employee.lastName,
        preferredName: employee.preferredName,
        email: employee.email,
        personalEmail: employee.personalEmail,
        workPhone: employee.workPhone,
        extension: employee.extension,
        mobilePhone: employee.mobilePhone,
        homePhone: employee.homePhone,
        jobTitle: employee.jobTitle,
        departmentId,
        divisionId,
        locationId,
        hireDate: employee.hireDate,
        originalHireDate: employee.originalHireDate,
        terminationDate: employee.terminationDate,
        employmentStatus: employee.employmentStatus,
        gender: employee.gender,
        birthDate: employee.birthDate,
        maritalStatus: employee.maritalStatus,
        nationality: employee.nationality,
        citizenship: employee.citizenship,
        addressStreet1: employee.addressStreet1,
        addressStreet2: employee.addressStreet2,
        addressCity: employee.addressCity,
        addressProvince: employee.addressProvince,
        addressPostalCode: employee.addressPostalCode,
        addressCountry: employee.addressCountry,
        linkedInUrl: employee.linkedInUrl,
        twitterUrl: employee.twitterUrl,
        updatedAt: new Date(),
      };

      if (byBamboo) {
        await db
          .update(employees)
          .set(values)
          .where(eq(employees.id, byBamboo.id));
        return { id: byBamboo.id, created: false };
      }

      const [byEmail] = await db
        .select({ id: employees.id, bambooId: employees.bambooId })
        .from(employees)
        .where(eq(employees.email, employee.email))
        .limit(1);
      if (byEmail && !byEmail.bambooId) {
        await db
          .update(employees)
          .set(values)
          .where(eq(employees.id, byEmail.id));
        return { id: byEmail.id, created: false };
      }

      try {
        const [created] = await db
          .insert(employees)
          .values({
            ...values,
            accessLevel: "employee",
          })
          .returning({ id: employees.id });
        return { id: created.id, created: true };
      } catch {
        const [created] = await db
          .insert(employees)
          .values({
            ...values,
            employeeNumber: `B${bambooId}`,
            accessLevel: "employee",
          })
          .returning({ id: employees.id });
        return { id: created.id, created: true };
      }
    },

    async setManager(employeeId, managerId) {
      await db
        .update(employees)
        .set({ managerId, updatedAt: new Date() })
        .where(eq(employees.id, employeeId));
      if (managerId != null) {
        await rebindPendingManagerApprovals(employeeId, managerId, db);
      }
    },

    async setUnresolvedSupervisor(employeeId, supervisorBambooId) {
      await db
        .update(employees)
        .set({
          pendingSupervisorBambooId: supervisorBambooId,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, employeeId));
      if (supervisorBambooId) {
        await unassignPendingManagerApprovals(employeeId, db);
      }
    },

    async listUnresolvedSupervisors() {
      const rows: Array<{
        employeeId: number;
        supervisorBambooId: string | null;
      }> = await db
        .select({
          employeeId: employees.id,
          supervisorBambooId: employees.pendingSupervisorBambooId,
        })
        .from(employees)
        .where(isNotNull(employees.pendingSupervisorBambooId));
      return rows.flatMap((row) =>
        row.supervisorBambooId
          ? [
              {
                employeeId: row.employeeId,
                supervisorBambooId: row.supervisorBambooId,
              },
            ]
          : []
      );
    },

    async markTerminated(bambooId) {
      await db
        .update(employees)
        .set({
          employmentStatus: "terminated",
          updatedAt: new Date(),
        })
        .where(eq(employees.bambooId, bambooId));
    },

    async replaceJobHistory(employeeId, rows) {
      await db.delete(jobHistory).where(eq(jobHistory.employeeId, employeeId));
      const values = [];
      for (const row of rows) {
        const effectiveDate = String(row.effectiveDate || "");
        if (!effectiveDate) continue;
        const departmentId = row.departmentName
          ? await store.upsertOrgUnit("department", String(row.departmentName))
          : null;
        const divisionId = row.divisionName
          ? await store.upsertOrgUnit("division", String(row.divisionName))
          : null;
        const locationId = row.locationName
          ? await store.upsertOrgUnit("location", String(row.locationName))
          : null;
        values.push({
          employeeId,
          effectiveDate,
          jobTitle: row.jobTitle ? String(row.jobTitle) : null,
          departmentId,
          divisionId,
          locationId,
          comment: row.comment ? String(row.comment) : null,
        });
      }
      if (values.length > 0) {
        await db.insert(jobHistory).values(values);
      }
    },

    async replaceEmploymentStatusHistory(employeeId, rows) {
      await db
        .delete(employmentStatusHistory)
        .where(eq(employmentStatusHistory.employeeId, employeeId));
      const values = rows
        .filter((row) => row.effectiveDate && row.status)
        .map((row) => ({
          employeeId,
          effectiveDate: String(row.effectiveDate),
          status: row.status as MappedEmployee["employmentStatus"],
          changeType: String(row.changeType || "status_change"),
          comment: row.comment ? String(row.comment) : null,
        }));
      if (values.length > 0) {
        await db.insert(employmentStatusHistory).values(values);
      }
    },

    async replaceCompensationHistory(employeeId, rows) {
      await db
        .delete(compensationHistory)
        .where(eq(compensationHistory.employeeId, employeeId));
      const values = rows
        .filter((row) => row.effectiveDate)
        .map((row) => ({
          employeeId,
          effectiveDate: String(row.effectiveDate),
          payRate: row.payRate ? String(row.payRate) : null,
          payType: row.payType ? String(row.payType) : null,
          paySchedule: row.paySchedule ? String(row.paySchedule) : null,
          currency: row.currency ? String(row.currency) : "CAD",
          changeReason: row.changeReason ? String(row.changeReason) : null,
          comment: row.comment ? String(row.comment) : null,
        }));
      if (values.length > 0) {
        await db.insert(compensationHistory).values(values);
      }
    },

    async replaceEmergencyContacts(employeeId, rows) {
      await db
        .delete(emergencyContacts)
        .where(eq(emergencyContacts.employeeId, employeeId));
      const values = rows
        .filter((row) => row.name && row.phone)
        .map((row) => ({
          employeeId,
          name: String(row.name),
          relationship: row.relationship ? String(row.relationship) : null,
          phone: String(row.phone),
          alternatePhone: row.alternatePhone ? String(row.alternatePhone) : null,
          email: row.email ? String(row.email) : null,
          isPrimary: Boolean(row.isPrimary),
        }));
      if (values.length > 0) {
        await db.insert(emergencyContacts).values(values);
      }
    },

    async upsertTimeOffPolicy(name, policyType) {
      const [existing] = await db
        .select({ id: timeOffPolicies.id })
        .from(timeOffPolicies)
        .where(sql`lower(${timeOffPolicies.name}) = ${name.toLowerCase()}`)
        .limit(1);
      if (existing) return existing.id;
      const [created] = await db
        .insert(timeOffPolicies)
        .values({
          name,
          policyType: policyType || name,
        })
        .returning({ id: timeOffPolicies.id });
      return created.id;
    },

    async upsertTimeOffBalance(employeeId, policyId, sourceBalance) {
      const [existing] = await db
        .select({ id: timeOffBalances.id })
        .from(timeOffBalances)
        .where(
          and(
            eq(timeOffBalances.employeeId, employeeId),
            eq(timeOffBalances.policyId, policyId)
          )
        )
        .limit(1);
      if (!existing) {
        await db.insert(timeOffBalances).values({
          employeeId,
          policyId,
          sourceBalance,
          balance: sourceBalance,
        });
        return;
      }

      // One UPDATE so a concurrent approval cannot insert a `used:` row
      // after we read the ledger and then have its deduction overwritten.
      const spendable = sql`${sourceBalance}::numeric + coalesce((
        select sum(${timeOffBalanceAdjustments.amount}::numeric)
        from ${timeOffBalanceAdjustments}
        where ${timeOffBalanceAdjustments.balanceId} = ${timeOffBalances.id}
          and lower(${timeOffBalanceAdjustments.reason}) not like 'accrual:%'
          and lower(${timeOffBalanceAdjustments.reason}) not like 'carryover:%'
      ), 0)`;
      await db
        .update(timeOffBalances)
        .set({
          sourceBalance,
          balance: spendable,
          updatedAt: new Date(),
        })
        .where(eq(timeOffBalances.id, existing.id));
    },

    async applyBrendanCarryOver(opts) {
      const rows: Array<{
        id: number;
        email: string;
        vendastaSub: string | null;
      }> = await db
        .select({
          id: employees.id,
          email: employees.email,
          vendastaSub: employees.vendastaSub,
        })
        .from(employees);
      const brendan = rows.find((row) => isBrendanWorkEmail(row.email));
      if (!brendan) return false;
      if (opts.vendastaSub) {
        await db
          .update(employees)
          .set({ vendastaSub: null, updatedAt: new Date() })
          .where(eq(employees.vendastaSub, opts.vendastaSub));
      }
      await db
        .update(employees)
        .set({
          accessLevel: "full_admin",
          vendastaSub: opts.vendastaSub,
          userId: opts.userId,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, brendan.id));
      return true;
    },

    async recordSyncRun(run) {
      await db.insert(bambooSyncRuns).values({
        startedAt: run.startedAt ? new Date(String(run.startedAt)) : new Date(),
        finishedAt: run.finishedAt ? new Date(String(run.finishedAt)) : new Date(),
        mode: String(run.mode || "full"),
        status: String(run.status || "success"),
        employeesFetched: Number(run.employeesFetched || 0),
        employeesCreated: Number(run.employeesCreated || 0),
        employeesUpdated: Number(run.employeesUpdated || 0),
        demoRemoved: Number(run.demoRemoved || 0),
        latestChanged: run.latestChanged ? String(run.latestChanged) : null,
        unmappedFields: Array.isArray(run.unmappedFields) ? run.unmappedFields : [],
        errorMessage: run.errorMessage ? String(run.errorMessage) : null,
      });
    },

    async lastSuccessfulIncrementalCursor() {
      const rows = await db
        .select({
          latestChanged: bambooSyncRuns.latestChanged,
          status: bambooSyncRuns.status,
        })
        .from(bambooSyncRuns)
        .where(eq(bambooSyncRuns.status, "success"))
        .orderBy(sql`${bambooSyncRuns.id} desc`)
        .limit(1);
      return rows[0]?.latestChanged ?? null;
    },

    async transaction(fn) {
      if (!db.transaction) return fn(store);
      return db.transaction(async (tx: DbLike) => fn(createBambooSyncStore(tx)));
    },
  };

  return store;
}

export { DEMO_SEED_EMAILS, isDemoEmployee };
