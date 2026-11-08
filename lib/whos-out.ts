import { db } from "@/lib/db";
import { timeOffRequests, employees, timeOffPolicies } from "@/lib/db/schema";
import { and, eq, gte, lte, or } from "drizzle-orm";
import { isOutOnDate } from "@/lib/date-overlap";

export { isOutOnDate } from "@/lib/date-overlap";

export async function getWhosOut(startDate: string, endDate: string) {
  return db
    .select({
      requestId: timeOffRequests.id,
      startDate: timeOffRequests.startDate,
      endDate: timeOffRequests.endDate,
      daysRequested: timeOffRequests.daysRequested,
      employeeId: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      preferredName: employees.preferredName,
      jobTitle: employees.jobTitle,
      policyName: timeOffPolicies.name,
      policyType: timeOffPolicies.policyType,
    })
    .from(timeOffRequests)
    .leftJoin(employees, eq(timeOffRequests.employeeId, employees.id))
    .leftJoin(timeOffPolicies, eq(timeOffRequests.policyId, timeOffPolicies.id))
    .where(
      and(
        eq(timeOffRequests.status, "approved"),
        or(
          and(
            gte(timeOffRequests.startDate, startDate),
            lte(timeOffRequests.startDate, endDate)
          ),
          and(
            gte(timeOffRequests.endDate, startDate),
            lte(timeOffRequests.endDate, endDate)
          ),
          and(
            lte(timeOffRequests.startDate, startDate),
            gte(timeOffRequests.endDate, endDate)
          )
        )
      )
    );
}
