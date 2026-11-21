import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq, not } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { visibleDirectoryEmail } from "@/lib/authz";
import { OrgChartTree } from "@/components/org-chart-tree";
import { buildOrgChart } from "@/lib/org-chart";

export default async function OrgChartPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const rows = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      preferredName: employees.preferredName,
      jobTitle: employees.jobTitle,
      email: employees.email,
      managerId: employees.managerId,
      employmentStatus: employees.employmentStatus,
    })
    .from(employees)
    .where(not(eq(employees.employmentStatus, "terminated")));

  const forest = buildOrgChart(
    rows.map((emp) => ({
      ...emp,
      email:
        visibleDirectoryEmail(emp.email, {
          isSelf: emp.id === session.user.employeeId,
        }) || "",
    }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Organization Chart</h1>
        <p className="text-muted-foreground">Company reporting structure</p>
      </div>

      <OrgChartTree forest={forest} />
    </div>
  );
}
