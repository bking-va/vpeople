import { eq, inArray, isNotNull, or, sql } from "drizzle-orm";
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
  employeeEducation,
  employeeNotes,
  employeeTasks,
  employeeVisas,
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
import { isBrendanWorkEmail } from "./map";
import { DEMO_SEED_EMAILS, isDemoEmployee } from "./demo";
import {
  BAMBOO_WRITE_CHUNK_SIZE,
  chunkRows,
  reportChunkProgress,
  type BatchProgress,
} from "./chunks";
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
  execute?: (query: any) => Promise<any>;
  transaction?: <T>(fn: (tx: any) => Promise<T>) => Promise<T>;
};

type HistoryReplacement = {
  employeeId: number;
  rows: Array<Record<string, unknown>>;
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

function chunkSizeOf(progress?: BatchProgress): number {
  return Math.max(1, progress?.chunkSize ?? BAMBOO_WRITE_CHUNK_SIZE);
}

function uniqueNames(values: Array<string | null | undefined>): string[] {
  const byLower = new Map<string, string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!byLower.has(key)) byLower.set(key, trimmed);
  }
  return [...byLower.values()];
}

function assignEmployeeNumber(
  desired: string | null,
  bambooId: string,
  used: Set<string>,
  own?: string | null
): string | null {
  if (desired && (own === desired || !used.has(desired))) return desired;
  if (desired) {
    const fallback = `B${bambooId}`;
    if (own === fallback || !used.has(fallback)) return fallback;
    return fallback;
  }
  return null;
}

function employeeWriteValues(
  bambooId: string,
  employee: MappedEmployee,
  org: {
    departmentId: number | null;
    divisionId: number | null;
    locationId: number | null;
  },
  employeeNumber: string | null
) {
  return {
    bambooId,
    employeeNumber,
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
    departmentId: org.departmentId,
    divisionId: org.divisionId,
    locationId: org.locationId,
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

async function executeSql(db: DbLike, query: ReturnType<typeof sql>) {
  if (typeof db.execute !== "function") {
    throw new Error("Database adapter cannot execute batched SQL");
  }
  return db.execute(query);
}

export async function applyBambooWriteGuards(db: DbLike): Promise<void> {
  if (typeof db.execute !== "function") return;
  await db.execute(sql`SET LOCAL statement_timeout = '60s'`);
  await db.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '180s'`);
  await db.execute(sql`SET LOCAL lock_timeout = '15s'`);
}

async function updateEmployeesChunk(
  db: DbLike,
  rows: Array<ReturnType<typeof employeeWriteValues> & { id: number }>
) {
  if (rows.length === 0) return;
  const tuples = rows.map(
    (row) => sql`(
      CAST(${row.id} AS int),
      ${row.bambooId},
      ${row.employeeNumber},
      ${row.firstName},
      ${row.middleName},
      ${row.lastName},
      ${row.preferredName},
      ${row.email},
      ${row.personalEmail},
      ${row.workPhone},
      ${row.extension},
      ${row.mobilePhone},
      ${row.homePhone},
      ${row.jobTitle},
      CAST(${row.departmentId} AS int),
      CAST(${row.divisionId} AS int),
      CAST(${row.locationId} AS int),
      CAST(${row.hireDate} AS date),
      CAST(${row.originalHireDate} AS date),
      CAST(${row.terminationDate} AS date),
      CAST(${row.employmentStatus} AS employment_status),
      CAST(${row.gender} AS gender),
      CAST(${row.birthDate} AS date),
      ${row.maritalStatus},
      ${row.nationality},
      ${row.citizenship},
      ${row.addressStreet1},
      ${row.addressStreet2},
      ${row.addressCity},
      ${row.addressProvince},
      ${row.addressPostalCode},
      ${row.addressCountry},
      ${row.linkedInUrl},
      ${row.twitterUrl}
    )`
  );
  await executeSql(
    db,
    sql`
      UPDATE employees AS e SET
        bamboo_id = v.bamboo_id,
        employee_number = v.employee_number,
        first_name = v.first_name,
        middle_name = v.middle_name,
        last_name = v.last_name,
        preferred_name = v.preferred_name,
        email = v.email,
        personal_email = v.personal_email,
        work_phone = v.work_phone,
        extension = v.extension,
        mobile_phone = v.mobile_phone,
        home_phone = v.home_phone,
        job_title = v.job_title,
        department_id = CAST(v.department_id AS int),
        division_id = CAST(v.division_id AS int),
        location_id = CAST(v.location_id AS int),
        hire_date = CAST(v.hire_date AS date),
        original_hire_date = CAST(v.original_hire_date AS date),
        termination_date = CAST(v.termination_date AS date),
        employment_status = CAST(v.employment_status AS employment_status),
        gender = CAST(v.gender AS gender),
        birth_date = CAST(v.birth_date AS date),
        marital_status = v.marital_status,
        nationality = v.nationality,
        citizenship = v.citizenship,
        address_street1 = v.address_street1,
        address_street2 = v.address_street2,
        address_city = v.address_city,
        address_province = v.address_province,
        address_postal_code = v.address_postal_code,
        address_country = v.address_country,
        linkedin_url = v.linkedin_url,
        twitter_url = v.twitter_url,
        updated_at = now()
      FROM (VALUES ${sql.join(tuples, sql`, `)}) AS v(
        id, bamboo_id, employee_number, first_name, middle_name, last_name,
        preferred_name, email, personal_email, work_phone, extension,
        mobile_phone, home_phone, job_title, department_id, division_id,
        location_id, hire_date, original_hire_date, termination_date,
        employment_status, gender, birth_date, marital_status, nationality,
        citizenship, address_street1, address_street2, address_city,
        address_province, address_postal_code, address_country,
        linkedin_url, twitter_url
      )
      WHERE e.id = CAST(v.id AS int)
    `
  );
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
      const ids = await store.upsertOrgUnits(kind, [name]);
      return ids.get(name.trim().toLowerCase()) ?? null;
    },

    async upsertOrgUnits(kind, names) {
      const unique = uniqueNames(names);
      const map = new Map<string, number>();
      if (unique.length === 0) return map;

      if (kind === "department") {
        const existing: Array<{ id: number; name: string }> = await db
          .select({ id: departments.id, name: departments.name })
          .from(departments);
        for (const row of existing) map.set(row.name.toLowerCase(), row.id);
        const missing = unique.filter((name) => !map.has(name.toLowerCase()));
        if (missing.length > 0) {
          const inserted = await db
            .insert(departments)
            .values(missing.map((name) => ({ name })))
            .onConflictDoNothing()
            .returning({ id: departments.id, name: departments.name });
          for (const row of inserted ?? []) map.set(row.name.toLowerCase(), row.id);
        }
      } else if (kind === "division") {
        const existing: Array<{ id: number; name: string }> = await db
          .select({ id: divisions.id, name: divisions.name })
          .from(divisions);
        for (const row of existing) map.set(row.name.toLowerCase(), row.id);
        const missing = unique.filter((name) => !map.has(name.toLowerCase()));
        if (missing.length > 0) {
          const inserted = await db
            .insert(divisions)
            .values(missing.map((name) => ({ name })))
            .onConflictDoNothing()
            .returning({ id: divisions.id, name: divisions.name });
          for (const row of inserted ?? []) map.set(row.name.toLowerCase(), row.id);
        }
      } else if (kind === "location") {
        const existing: Array<{ id: number; name: string }> = await db
          .select({ id: locations.id, name: locations.name })
          .from(locations);
        for (const row of existing) map.set(row.name.toLowerCase(), row.id);
        const missing = unique.filter((name) => !map.has(name.toLowerCase()));
        if (missing.length > 0) {
          const inserted = await db
            .insert(locations)
            .values(missing.map((name) => ({ name, country: "Unknown" })))
            .returning({ id: locations.id, name: locations.name });
          for (const row of inserted ?? []) map.set(row.name.toLowerCase(), row.id);
        }
      } else {
        const existing: Array<{ id: number; title: string }> = await db
          .select({ id: jobTitles.id, title: jobTitles.title })
          .from(jobTitles);
        for (const row of existing) map.set(row.title.toLowerCase(), row.id);
        const missing = unique.filter((name) => !map.has(name.toLowerCase()));
        if (missing.length > 0) {
          const inserted = await db
            .insert(jobTitles)
            .values(missing.map((title) => ({ title })))
            .onConflictDoNothing()
            .returning({ id: jobTitles.id, title: jobTitles.title });
          for (const row of inserted ?? []) map.set(row.title.toLowerCase(), row.id);
        }
      }

      const unresolved = unique.filter((name) => !map.has(name.toLowerCase()));
      if (unresolved.length === 0) return map;
      for (const name of unresolved) {
        const id = await findByName(
          db,
          kind === "department"
            ? departments
            : kind === "division"
              ? divisions
              : kind === "location"
                ? locations
                : jobTitles,
          kind === "department"
            ? departments.name
            : kind === "division"
              ? divisions.name
              : kind === "location"
                ? locations.name
                : jobTitles.title,
          name
        );
        if (id?.id) map.set(name.toLowerCase(), id.id);
      }
      return map;
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
      const result = await store.upsertEmployeesBatch(
        [{ bambooId, employee, departmentId, divisionId, locationId }],
        { chunkSize: 1 }
      );
      const id = result.idByBambooId.get(bambooId);
      if (id == null) throw new Error("Employee upsert did not return an id");
      return { id, created: result.created > 0 };
    },

    async upsertEmployeesBatch(rows, progress) {
      const idByBambooId = new Map<string, number>();
      if (rows.length === 0) {
        return { idByBambooId, created: 0, updated: 0 };
      }
      const existing = await store.listEmployees();
      const byBamboo = new Map(
        existing
          .filter((row) => row.bambooId)
          .map((row) => [row.bambooId as string, row])
      );
      const byEmailUnbound = new Map(
        existing
          .filter((row) => !row.bambooId)
          .map((row) => [row.email.toLowerCase(), row])
      );
      const usedNumbers = new Set(
        existing
          .map((row) => row.employeeNumber)
          .filter((value): value is string => Boolean(value))
      );

      const updates: Array<ReturnType<typeof employeeWriteValues> & { id: number }> =
        [];
      const inserts: Array<ReturnType<typeof employeeWriteValues> & { accessLevel: "employee" }> =
        [];

      for (const row of rows) {
        const matched =
          byBamboo.get(row.bambooId) ??
          byEmailUnbound.get(row.employee.email.toLowerCase()) ??
          null;
        const employeeNumber = assignEmployeeNumber(
          row.employee.employeeNumber,
          row.bambooId,
          usedNumbers,
          matched?.employeeNumber
        );
        if (matched?.employeeNumber && matched.employeeNumber !== employeeNumber) {
          usedNumbers.delete(matched.employeeNumber);
        }
        if (employeeNumber) usedNumbers.add(employeeNumber);
        const values = employeeWriteValues(
          row.bambooId,
          row.employee,
          {
            departmentId: row.departmentId,
            divisionId: row.divisionId,
            locationId: row.locationId,
          },
          employeeNumber
        );
        if (matched) {
          updates.push({ ...values, id: matched.id });
          idByBambooId.set(row.bambooId, matched.id);
          byBamboo.set(row.bambooId, { ...matched, bambooId: row.bambooId });
          byEmailUnbound.delete(row.employee.email.toLowerCase());
        } else {
          inserts.push({ ...values, accessLevel: "employee" });
        }
      }

      const size = chunkSizeOf(progress);
      const total = updates.length + inserts.length;
      let done = 0;
      for (const chunk of chunkRows(updates, size)) {
        await updateEmployeesChunk(db, chunk);
        done += chunk.length;
        reportChunkProgress(progress, done, total);
      }
      for (const chunk of chunkRows(inserts, size)) {
        const created: Array<{ id: number; bambooId: string | null }> = await db
          .insert(employees)
          .values(chunk)
          .returning({ id: employees.id, bambooId: employees.bambooId });
        for (const row of created) {
          if (row.bambooId) idByBambooId.set(row.bambooId, row.id);
        }
        done += chunk.length;
        reportChunkProgress(progress, done, total);
      }
      if (total === 0) reportChunkProgress(progress, 0, 0);
      return {
        idByBambooId,
        created: inserts.length,
        updated: updates.length,
      };
    },

    async setManager(employeeId, managerId) {
      await store.setManagersBatch([{ employeeId, managerId }]);
    },

    async setManagersBatch(links, progress) {
      if (links.length === 0) return;
      const size = chunkSizeOf(progress);
      let done = 0;
      for (const chunk of chunkRows(links, size)) {
        const tuples = chunk.map(
          (link) =>
            sql`(CAST(${link.employeeId} AS int), CAST(${link.managerId} AS int))`
        );
        await executeSql(
          db,
          sql`
            UPDATE employees AS e
            SET manager_id = CAST(v.manager_id AS int),
                updated_at = now()
            FROM (VALUES ${sql.join(tuples, sql`, `)}) AS v(id, manager_id)
            WHERE e.id = CAST(v.id AS int)
          `
        );
        done += chunk.length;
        reportChunkProgress(progress, done, links.length);
      }
      const resolved = links.filter(
        (link): link is { employeeId: number; managerId: number } =>
          link.managerId != null
      );
      if (resolved.length > 0) {
        const { rebindPendingManagerApprovalsMany } = await import(
          "@/lib/approvals"
        );
        await rebindPendingManagerApprovalsMany(resolved, db);
      }
    },

    async setUnresolvedSupervisor(employeeId, supervisorBambooId) {
      await store.setUnresolvedSupervisorsBatch([
        { employeeId, supervisorBambooId },
      ]);
    },

    async setUnresolvedSupervisorsBatch(links, progress) {
      if (links.length === 0) return;
      const size = chunkSizeOf(progress);
      let done = 0;
      for (const chunk of chunkRows(links, size)) {
        const tuples = chunk.map(
          (link) =>
            sql`(CAST(${link.employeeId} AS int), CAST(${link.supervisorBambooId} AS text))`
        );
        await executeSql(
          db,
          sql`
            UPDATE employees AS e
            SET pending_supervisor_bamboo_id = CAST(v.pending_supervisor_bamboo_id AS text),
                updated_at = now()
            FROM (VALUES ${sql.join(tuples, sql`, `)}) AS v(id, pending_supervisor_bamboo_id)
            WHERE e.id = CAST(v.id AS int)
          `
        );
        done += chunk.length;
        reportChunkProgress(progress, done, links.length);
      }
      const unresolved = links
        .filter((link) => Boolean(link.supervisorBambooId))
        .map((link) => link.employeeId);
      if (unresolved.length > 0) {
        const { unassignPendingManagerApprovalsMany } = await import(
          "@/lib/approvals"
        );
        await unassignPendingManagerApprovalsMany(unresolved, db);
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
      await store.markTerminatedBatch([bambooId]);
    },

    async markTerminatedBatch(bambooIds, progress) {
      const unique = [...new Set(bambooIds.filter(Boolean))];
      if (unique.length === 0) return;
      const size = chunkSizeOf(progress);
      let done = 0;
      for (const chunk of chunkRows(unique, size)) {
        await db
          .update(employees)
          .set({
            employmentStatus: "terminated",
            updatedAt: new Date(),
          })
          .where(inArray(employees.bambooId, chunk));
        done += chunk.length;
        reportChunkProgress(progress, done, unique.length);
      }
    },

    async replaceJobHistory(employeeId, rows) {
      await store.replaceJobHistoryMany([{ employeeId, rows }]);
    },

    async replaceJobHistoryMany(replacements, progress) {
      await replaceChildTable(
        db,
        store,
        replacements,
        progress,
        jobHistory,
        async (employeeId, rows, org) => {
          const values = [];
          for (const row of rows) {
            const effectiveDate = String(row.effectiveDate || "");
            if (!effectiveDate) continue;
            values.push({
              employeeId,
              effectiveDate,
              jobTitle: row.jobTitle ? String(row.jobTitle) : null,
              departmentId: org.idFor("department", row.departmentName),
              divisionId: org.idFor("division", row.divisionName),
              locationId: org.idFor("location", row.locationName),
              comment: row.comment ? String(row.comment) : null,
            });
          }
          return values;
        }
      );
    },

    async replaceEmploymentStatusHistory(employeeId, rows) {
      await store.replaceEmploymentStatusHistoryMany([{ employeeId, rows }]);
    },

    async replaceEmploymentStatusHistoryMany(replacements, progress) {
      await replaceChildTable(
        db,
        store,
        replacements,
        progress,
        employmentStatusHistory,
        async (employeeId, rows) =>
          rows
            .filter((row) => row.effectiveDate && row.status)
            .map((row) => ({
              employeeId,
              effectiveDate: String(row.effectiveDate),
              status: row.status as MappedEmployee["employmentStatus"],
              changeType: String(row.changeType || "status_change"),
              comment: row.comment ? String(row.comment) : null,
            }))
      );
    },

    async replaceCompensationHistory(employeeId, rows) {
      await store.replaceCompensationHistoryMany([{ employeeId, rows }]);
    },

    async replaceCompensationHistoryMany(replacements, progress) {
      await replaceChildTable(
        db,
        store,
        replacements,
        progress,
        compensationHistory,
        async (employeeId, rows) =>
          rows
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
            }))
      );
    },

    async replaceEmergencyContacts(employeeId, rows) {
      await store.replaceEmergencyContactsMany([{ employeeId, rows }]);
    },

    async replaceEmergencyContactsMany(replacements, progress) {
      await replaceChildTable(
        db,
        store,
        replacements,
        progress,
        emergencyContacts,
        async (employeeId, rows) =>
          rows
            .filter((row) => row.name && row.phone)
            .map((row) => ({
              employeeId,
              name: String(row.name),
              relationship: row.relationship ? String(row.relationship) : null,
              phone: String(row.phone),
              alternatePhone: row.alternatePhone ? String(row.alternatePhone) : null,
              email: row.email ? String(row.email) : null,
              isPrimary: Boolean(row.isPrimary),
            }))
      );
    },

    async upsertTimeOffPolicy(name, policyType) {
      const ids = await store.upsertTimeOffPoliciesBatch([
        { name, policyType: policyType || name },
      ]);
      const id = ids.get(name.toLowerCase());
      if (id == null) throw new Error("Time-off policy upsert did not return an id");
      return id;
    },

    async upsertTimeOffPoliciesBatch(policies) {
      const map = new Map<string, number>();
      if (policies.length === 0) return map;
      const existing: Array<{ id: number; name: string }> = await db
        .select({ id: timeOffPolicies.id, name: timeOffPolicies.name })
        .from(timeOffPolicies);
      for (const row of existing) map.set(row.name.toLowerCase(), row.id);
      const missing = [];
      const seen = new Set<string>();
      for (const policy of policies) {
        const key = policy.name.toLowerCase();
        if (map.has(key) || seen.has(key) || !policy.name.trim()) continue;
        seen.add(key);
        missing.push({
          name: policy.name,
          policyType: policy.policyType || policy.name,
          bambooId: policy.bambooId || null,
        });
      }
      if (missing.length > 0) {
        const inserted = await db
          .insert(timeOffPolicies)
          .values(missing)
          .returning({ id: timeOffPolicies.id, name: timeOffPolicies.name });
        for (const row of inserted ?? []) map.set(row.name.toLowerCase(), row.id);
      }
      return map;
    },

    async upsertTimeOffBalance(employeeId, policyId, sourceBalance) {
      await store.upsertTimeOffBalancesBatch([
        { employeeId, policyId, sourceBalance },
      ]);
    },

    async upsertTimeOffBalancesBatch(rows, progress) {
      if (rows.length === 0) return;
      const employeeIds = [...new Set(rows.map((row) => row.employeeId))];
      const existing: Array<{
        id: number;
        employeeId: number;
        policyId: number;
      }> = [];
      for (const ids of chunkRows(employeeIds, chunkSizeOf(progress))) {
        const chunk = await db
          .select({
            id: timeOffBalances.id,
            employeeId: timeOffBalances.employeeId,
            policyId: timeOffBalances.policyId,
          })
          .from(timeOffBalances)
          .where(inArray(timeOffBalances.employeeId, ids));
        existing.push(...chunk);
      }
      const existingByKey = new Map(
        existing.map((row) => [`${row.employeeId}:${row.policyId}`, row])
      );
      const updates: Array<{ id: number; sourceBalance: string }> = [];
      const inserts: Array<{
        employeeId: number;
        policyId: number;
        sourceBalance: string;
        balance: string;
      }> = [];
      for (const row of rows) {
        const current = existingByKey.get(`${row.employeeId}:${row.policyId}`);
        if (current) {
          updates.push({ id: current.id, sourceBalance: row.sourceBalance });
        } else {
          inserts.push({
            employeeId: row.employeeId,
            policyId: row.policyId,
            sourceBalance: row.sourceBalance,
            balance: row.sourceBalance,
          });
          existingByKey.set(`${row.employeeId}:${row.policyId}`, {
            id: -1,
            employeeId: row.employeeId,
            policyId: row.policyId,
          });
        }
      }

      const size = chunkSizeOf(progress);
      const total = updates.length + inserts.length;
      let done = 0;
      for (const chunk of chunkRows(updates, size)) {
        const tuples = chunk.map(
          (row) =>
            sql`(CAST(${row.id} AS int), CAST(${row.sourceBalance} AS numeric))`
        );
        await executeSql(
          db,
          sql`
            UPDATE time_off_balances AS b
            SET
              source_balance = CAST(v.source_balance AS numeric),
              balance = CAST(v.source_balance AS numeric) + coalesce((
                select sum(${timeOffBalanceAdjustments.amount}::numeric)
                from ${timeOffBalanceAdjustments}
                where ${timeOffBalanceAdjustments.balanceId} = b.id
                  and lower(${timeOffBalanceAdjustments.reason}) not like 'accrual:%'
                  and lower(${timeOffBalanceAdjustments.reason}) not like 'carryover:%'
              ), 0),
              updated_at = now()
            FROM (VALUES ${sql.join(tuples, sql`, `)}) AS v(id, source_balance)
            WHERE b.id = CAST(v.id AS int)
          `
        );
        done += chunk.length;
        reportChunkProgress(progress, done, total);
      }
      for (const chunk of chunkRows(inserts, size)) {
        await db.insert(timeOffBalances).values(chunk);
        done += chunk.length;
        reportChunkProgress(progress, done, total);
      }
    },

    async upsertTimeOffRequestsBatch(rows, progress) {
      if (rows.length === 0) return 0;
      const size = chunkSizeOf(progress);
      let done = 0;
      for (const chunk of chunkRows(rows, size)) {
        const tuples = chunk.map(
          (row) => sql`(
            ${row.bambooId},
            CAST(${row.employeeId} AS int),
            CAST(${row.policyId} AS int),
            CAST(${row.startDate} AS date),
            CAST(${row.endDate} AS date),
            CAST(${row.daysRequested} AS numeric),
            CAST(${row.status} AS time_off_request_status),
            ${row.notes},
            ${row.reviewNotes},
            CAST(${row.reviewedAt} AS timestamp),
            CAST(${row.createdAt} AS timestamp)
          )`
        );
        await executeSql(
          db,
          sql`
            INSERT INTO time_off_requests (
              bamboo_id, employee_id, policy_id, start_date, end_date,
              days_requested, status, notes, review_notes, reviewed_at,
              workflow_id, created_at, updated_at
            )
            SELECT
              v.bamboo_id,
              CAST(v.employee_id AS int),
              CAST(v.policy_id AS int),
              CAST(v.start_date AS date),
              CAST(v.end_date AS date),
              CAST(v.days_requested AS numeric),
              CAST(v.status AS time_off_request_status),
              v.notes,
              v.review_notes,
              CAST(v.reviewed_at AS timestamp),
              CAST(NULL AS int),
              COALESCE(CAST(v.created_at AS timestamp), now()),
              now()
            FROM (VALUES ${sql.join(tuples, sql`, `)}) AS v(
              bamboo_id, employee_id, policy_id, start_date, end_date,
              days_requested, status, notes, review_notes, reviewed_at, created_at
            )
            ON CONFLICT (bamboo_id) DO UPDATE SET
              employee_id = CAST(EXCLUDED.employee_id AS int),
              policy_id = CAST(EXCLUDED.policy_id AS int),
              start_date = CAST(EXCLUDED.start_date AS date),
              end_date = CAST(EXCLUDED.end_date AS date),
              days_requested = CAST(EXCLUDED.days_requested AS numeric),
              status = CAST(EXCLUDED.status AS time_off_request_status),
              notes = EXCLUDED.notes,
              review_notes = EXCLUDED.review_notes,
              reviewed_at = CAST(EXCLUDED.reviewed_at AS timestamp),
              workflow_id = NULL,
              updated_at = now()
          `
        );
        done += chunk.length;
        reportChunkProgress(progress, done, rows.length);
      }
      return rows.length;
    },

    async upsertJobOpeningsBatch(rows, progress) {
      if (rows.length === 0) return 0;
      const size = chunkSizeOf(progress);
      let done = 0;
      for (const chunk of chunkRows(rows, size)) {
        const tuples = chunk.map(
          (row) => sql`(
            ${row.bambooId},
            ${row.title},
            CAST(${row.departmentId} AS int),
            CAST(${row.locationId} AS int),
            CAST(${row.hiringLeadId} AS int),
            CAST(${row.status} AS job_opening_status),
            ${row.bambooStatusId},
            ${row.bambooStatusLabel},
            ${row.employmentType},
            ${row.description},
            ${row.requirements},
            CAST(${row.openDate} AS date),
            CAST(${row.closeDate} AS date)
          )`
        );
        await executeSql(
          db,
          sql`
            INSERT INTO job_openings (
              bamboo_id, title, department_id, location_id, hiring_lead_id,
              status, bamboo_status_id, bamboo_status_label, employment_type,
              description, requirements, open_date, close_date, created_at, updated_at
            )
            SELECT
              v.bamboo_id,
              v.title,
              CAST(v.department_id AS int),
              CAST(v.location_id AS int),
              CAST(v.hiring_lead_id AS int),
              CAST(v.status AS job_opening_status),
              v.bamboo_status_id,
              v.bamboo_status_label,
              v.employment_type,
              v.description,
              v.requirements,
              CAST(v.open_date AS date),
              CAST(v.close_date AS date),
              now(),
              now()
            FROM (VALUES ${sql.join(tuples, sql`, `)}) AS v(
              bamboo_id, title, department_id, location_id, hiring_lead_id,
              status, bamboo_status_id, bamboo_status_label, employment_type,
              description, requirements, open_date, close_date
            )
            ON CONFLICT (bamboo_id) DO UPDATE SET
              title = EXCLUDED.title,
              department_id = CAST(EXCLUDED.department_id AS int),
              location_id = CAST(EXCLUDED.location_id AS int),
              hiring_lead_id = CAST(EXCLUDED.hiring_lead_id AS int),
              status = CAST(EXCLUDED.status AS job_opening_status),
              bamboo_status_id = EXCLUDED.bamboo_status_id,
              bamboo_status_label = EXCLUDED.bamboo_status_label,
              employment_type = EXCLUDED.employment_type,
              description = EXCLUDED.description,
              requirements = EXCLUDED.requirements,
              open_date = CAST(EXCLUDED.open_date AS date),
              close_date = CAST(EXCLUDED.close_date AS date),
              updated_at = now()
          `
        );
        done += chunk.length;
        reportChunkProgress(progress, done, rows.length);
      }
      return rows.length;
    },

    async upsertEducationBatch(rows, progress) {
      if (rows.length === 0) return 0;
      const size = chunkSizeOf(progress);
      let done = 0;
      for (const chunk of chunkRows(rows, size)) {
        const tuples = chunk.map(
          (row) => sql`(
            ${row.bambooId},
            CAST(${row.employeeId} AS int),
            ${row.institution},
            ${row.degree},
            ${row.fieldOfStudy},
            CAST(${row.startDate} AS date),
            CAST(${row.endDate} AS date),
            ${row.notes}
          )`
        );
        await executeSql(
          db,
          sql`
            INSERT INTO employee_education (
              bamboo_id, employee_id, institution, degree, field_of_study,
              start_date, end_date, notes, created_at, updated_at
            )
            SELECT
              v.bamboo_id,
              CAST(v.employee_id AS int),
              v.institution,
              v.degree,
              v.field_of_study,
              CAST(v.start_date AS date),
              CAST(v.end_date AS date),
              v.notes,
              now(),
              now()
            FROM (VALUES ${sql.join(tuples, sql`, `)}) AS v(
              bamboo_id, employee_id, institution, degree, field_of_study,
              start_date, end_date, notes
            )
            ON CONFLICT (bamboo_id) DO UPDATE SET
              employee_id = CAST(EXCLUDED.employee_id AS int),
              institution = EXCLUDED.institution,
              degree = EXCLUDED.degree,
              field_of_study = EXCLUDED.field_of_study,
              start_date = CAST(EXCLUDED.start_date AS date),
              end_date = CAST(EXCLUDED.end_date AS date),
              notes = EXCLUDED.notes,
              updated_at = now()
          `
        );
        done += chunk.length;
        reportChunkProgress(progress, done, rows.length);
      }
      return rows.length;
    },

    async upsertVisasBatch(rows, progress) {
      if (rows.length === 0) return 0;
      const size = chunkSizeOf(progress);
      let done = 0;
      for (const chunk of chunkRows(rows, size)) {
        const tuples = chunk.map(
          (row) => sql`(
            ${row.bambooId},
            CAST(${row.employeeId} AS int),
            ${row.visaType},
            ${row.country},
            ${row.documentNumber},
            CAST(${row.issuedDate} AS date),
            CAST(${row.expiryDate} AS date),
            ${row.status}
          )`
        );
        await executeSql(
          db,
          sql`
            INSERT INTO employee_visas (
              bamboo_id, employee_id, visa_type, country, document_number,
              issued_date, expiry_date, status, created_at, updated_at
            )
            SELECT
              v.bamboo_id,
              CAST(v.employee_id AS int),
              v.visa_type,
              v.country,
              v.document_number,
              CAST(v.issued_date AS date),
              CAST(v.expiry_date AS date),
              v.status,
              now(),
              now()
            FROM (VALUES ${sql.join(tuples, sql`, `)}) AS v(
              bamboo_id, employee_id, visa_type, country, document_number,
              issued_date, expiry_date, status
            )
            ON CONFLICT (bamboo_id) DO UPDATE SET
              employee_id = CAST(EXCLUDED.employee_id AS int),
              visa_type = EXCLUDED.visa_type,
              country = EXCLUDED.country,
              document_number = EXCLUDED.document_number,
              issued_date = CAST(EXCLUDED.issued_date AS date),
              expiry_date = CAST(EXCLUDED.expiry_date AS date),
              status = EXCLUDED.status,
              updated_at = now()
          `
        );
        done += chunk.length;
        reportChunkProgress(progress, done, rows.length);
      }
      return rows.length;
    },

    async pruneImportedRowsNotIn(kind, keepBambooIds, progress) {
      const table =
        kind === "time_off_requests"
          ? timeOffRequests
          : kind === "job_openings"
            ? jobOpenings
            : kind === "education"
              ? employeeEducation
              : employeeVisas;
      const existing: Array<{ id: number; bambooId: string | null }> = await db
        .select({
          id: table.id,
          bambooId: table.bambooId,
        })
        .from(table);
      const keep = new Set(keepBambooIds.filter(Boolean));
      const toDelete = existing
        .filter((row) => row.bambooId && !keep.has(row.bambooId))
        .map((row) => row.id);
      if (toDelete.length === 0) return 0;
      const size = chunkSizeOf(progress);
      let done = 0;
      for (const chunk of chunkRows(toDelete, size)) {
        await db.delete(table).where(inArray(table.id, chunk));
        done += chunk.length;
        reportChunkProgress(progress, done, toDelete.length);
      }
      return toDelete.length;
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
        datasetCounts:
          run.datasetCounts && typeof run.datasetCounts === "object"
            ? run.datasetCounts
            : {},
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
      return db.transaction(async (tx: DbLike) => {
        await applyBambooWriteGuards(tx);
        return fn(createBambooSyncStore(tx));
      });
    },
  };

  return store;
}

type OrgLookup = {
  idFor(kind: "department" | "division" | "location", name: unknown): number | null;
};

async function replaceChildTable(
  db: DbLike,
  store: BambooSyncStore,
  replacements: HistoryReplacement[],
  progress: BatchProgress | undefined,
  table:
    | typeof jobHistory
    | typeof employmentStatusHistory
    | typeof compensationHistory
    | typeof emergencyContacts,
  mapRows: (
    employeeId: number,
    rows: Array<Record<string, unknown>>,
    org: OrgLookup
  ) => Promise<Array<Record<string, unknown>>>
) {
  if (replacements.length === 0) return;
  const employeeIds = [...new Set(replacements.map((row) => row.employeeId))];
  const size = chunkSizeOf(progress);
  const departmentNames = uniqueNames(
    replacements.flatMap((item) =>
      item.rows.map((row) =>
        row.departmentName ? String(row.departmentName) : null
      )
    )
  );
  const divisionNames = uniqueNames(
    replacements.flatMap((item) =>
      item.rows.map((row) => (row.divisionName ? String(row.divisionName) : null))
    )
  );
  const locationNames = uniqueNames(
    replacements.flatMap((item) =>
      item.rows.map((row) => (row.locationName ? String(row.locationName) : null))
    )
  );
  const [departmentsMap, divisionsMap, locationsMap] = await Promise.all([
    store.upsertOrgUnits("department", departmentNames),
    store.upsertOrgUnits("division", divisionNames),
    store.upsertOrgUnits("location", locationNames),
  ]);
  const org: OrgLookup = {
    idFor(kind, name) {
      if (!name) return null;
      const key = String(name).trim().toLowerCase();
      if (!key) return null;
      if (kind === "department") return departmentsMap.get(key) ?? null;
      if (kind === "division") return divisionsMap.get(key) ?? null;
      return locationsMap.get(key) ?? null;
    },
  };

  let done = 0;
  const deleteTotal = employeeIds.length;
  for (const ids of chunkRows(employeeIds, size)) {
    await db.delete(table).where(inArray(table.employeeId, ids));
    done += ids.length;
    reportChunkProgress(progress, done, deleteTotal);
  }

  const values: Array<Record<string, unknown>> = [];
  for (const item of replacements) {
    values.push(...(await mapRows(item.employeeId, item.rows, org)));
  }
  done = 0;
  for (const chunk of chunkRows(values, size)) {
    if (chunk.length === 0) continue;
    await db.insert(table).values(chunk);
    done += chunk.length;
    reportChunkProgress(progress, done, values.length);
  }
}

export { DEMO_SEED_EMAILS, isDemoEmployee };
export {
  BAMBOO_WRITE_CHUNK_SIZE,
  BAMBOO_STATEMENT_TIMEOUT,
  BAMBOO_IDLE_IN_TX_TIMEOUT,
  BAMBOO_LOCK_TIMEOUT,
} from "./chunks";
