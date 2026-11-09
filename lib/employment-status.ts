import { db } from "@/lib/db";
import { employmentStatusHistory } from "@/lib/db/schema";

export type EmploymentStatus =
  | "full_time"
  | "part_time"
  | "contractor"
  | "on_leave"
  | "terminated";

export type EmploymentStatusChangeType =
  | "hire"
  | "status_change"
  | "terminate"
  | "rehire"
  | "promotion";

export async function recordEmploymentStatusChange(
  opts: {
    employeeId: number;
    status: EmploymentStatus;
    effectiveDate: string;
    comment?: string | null;
    changeType?: EmploymentStatusChangeType;
    terminationReasonId?: number | null;
    recordedById?: number | null;
  },
  executor: Pick<typeof db, "insert"> = db
) {
  await executor.insert(employmentStatusHistory).values({
    employeeId: opts.employeeId,
    effectiveDate: opts.effectiveDate,
    status: opts.status,
    comment: opts.comment ?? null,
    changeType: opts.changeType ?? "status_change",
    terminationReasonId: opts.terminationReasonId ?? null,
    recordedById: opts.recordedById ?? null,
  });
}
