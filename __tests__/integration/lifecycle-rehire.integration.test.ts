/**
 * Integration tests for terminate / ROE mapping / rehire against real Postgres.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import {
  employees,
  employmentStatusHistory,
  terminationReasons,
  auditLogs,
  taskTemplates,
  employeeTasks,
} from "@/lib/db/schema";
import { publicEmployeeDto, terminateEmployee, rehireEmployee } from "@/lib/lifecycle";
import { DEFAULT_TERMINATION_REASONS } from "@/lib/roe";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

describe("Employee lifecycle (Real Postgres)", () => {
  const runId = Date.now();
  let admin: { id: number };
  let employee: { id: number };
  let reasonId: number;

  beforeAll(async () => {
    await db
      .insert(terminationReasons)
      .values([...DEFAULT_TERMINATION_REASONS])
      .onConflictDoNothing();
    const [reason] = await db
      .select()
      .from(terminationReasons)
      .where(eq(terminationReasons.code, "resignation"))
      .limit(1);
    reasonId = reason.id;

    const [adminRow] = await db
      .insert(employees)
      .values({
        employeeNumber: `LIFE_ADM_${runId}`,
        firstName: "Life",
        lastName: "Admin",
        email: `life.admin.${runId}@vendasta.com`,
        hireDate: "2018-01-01",
        originalHireDate: "2018-01-01",
        employmentStatus: "full_time",
        accessLevel: "full_admin",
      })
      .returning();
    admin = adminRow;

    const [emp] = await db
      .insert(employees)
      .values({
        employeeNumber: `LIFE_EMP_${runId}`,
        firstName: "Life",
        lastName: "Employee",
        email: `life.emp.${runId}@gmail.com`,
        hireDate: "2020-04-01",
        originalHireDate: "2020-04-01",
        employmentStatus: "full_time",
        accessLevel: "employee",
        jobTitle: "Analyst",
      })
      .returning();
    employee = emp;

    await db.insert(taskTemplates).values({
      name: `Collect laptop ${runId}`,
      taskType: "offboarding",
      dueDaysFromStart: 1,
      assignedToRole: "manager",
    }).onConflictDoNothing();
  });

  afterAll(async () => {
    try {
      await db.delete(employeeTasks).where(eq(employeeTasks.employeeId, employee.id));
      await db.delete(employmentStatusHistory).where(eq(employmentStatusHistory.employeeId, employee.id));
      await db.delete(auditLogs).where(eq(auditLogs.entityId, String(employee.id)));
      await db.delete(employees).where(eq(employees.id, employee.id));
      await db.delete(employees).where(eq(employees.id, admin.id));
    } finally {
      await pool.end();
    }
  });

  test("terminate records ROE code and status history, rehire preserves original hire date", async () => {
    const term = await terminateEmployee({
      employeeId: employee.id,
      actorId: admin.id,
      terminationDate: "2024-12-31",
      terminationType: "voluntary",
      terminationReasonId: reasonId,
      notes: "Accepted another role",
    });
    expect(term.ok).toBe(true);
    if (!term.ok) return;
    expect(term.roeCode).toBe("E");
    expect(term.employee.employmentStatus).toBe("terminated");
    expect(term.employee.terminationDate).toBe("2024-12-31");

    const dto = publicEmployeeDto(term.employee);
    expect(dto).not.toHaveProperty("roeCode");
    expect(dto).not.toHaveProperty("terminationType");
    expect(dto).not.toHaveProperty("terminationReasonId");

    const historyAfterTerm = await db
      .select()
      .from(employmentStatusHistory)
      .where(eq(employmentStatusHistory.employeeId, employee.id));
    expect(historyAfterTerm.some((row) => row.changeType === "terminate" && row.status === "terminated")).toBe(
      true
    );

    const again = await terminateEmployee({
      employeeId: employee.id,
      actorId: admin.id,
      terminationDate: "2025-01-01",
      terminationReasonId: reasonId,
    });
    expect(again.ok).toBe(false);

    const rehire = await rehireEmployee({
      employeeId: employee.id,
      actorId: admin.id,
      hireDate: "2026-02-02",
      employmentStatus: "full_time",
      notes: "Welcome back",
    });
    expect(rehire.ok).toBe(true);
    if (!rehire.ok) return;
    expect(rehire.employee.hireDate).toBe("2026-02-02");
    expect(rehire.employee.originalHireDate).toBe("2020-04-01");
    expect(rehire.employee.employmentStatus).toBe("full_time");
    expect(rehire.employee.terminationDate).toBeNull();
    expect(rehire.employee.roeCode).toBeNull();

    const history = await db
      .select()
      .from(employmentStatusHistory)
      .where(eq(employmentStatusHistory.employeeId, employee.id));
    expect(history.some((row) => row.changeType === "terminate")).toBe(true);
    expect(history.some((row) => row.changeType === "rehire" && row.status === "full_time")).toBe(true);
  });
});
