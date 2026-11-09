import { db } from "@/lib/db";
import { employmentStatusHistory } from "@/lib/db/schema";

type Status =
  | "full_time"
  | "part_time"
  | "contractor"
  | "on_leave"
  | "terminated";

export async function recordEmploymentStatusChange(
  opts: {
    employeeId: number;
    status: Status;
    effectiveDate: string;
    comment?: string | null;
  },
  executor: Pick<typeof db, "insert"> = db
) {
  await executor.insert(employmentStatusHistory).values({
    employeeId: opts.employeeId,
    effectiveDate: opts.effectiveDate,
    status: opts.status,
    comment: opts.comment ?? null,
  });
}
