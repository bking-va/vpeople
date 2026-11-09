import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees, terminationReasons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TerminationReasonList } from "@/components/termination-reason-list";
import { CANADIAN_ROE_CODES } from "@/lib/roe";

export default async function TerminationReasonsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const employeeId = session.user.employeeId;
  if (!employeeId) redirect("/settings");

  const [currentEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!currentEmployee || currentEmployee.accessLevel !== "full_admin") {
    redirect("/settings");
  }

  const reasons = await db.select().from(terminationReasons).orderBy(terminationReasons.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Termination Reasons</h1>
        <p className="text-muted-foreground">
          Configurable list mapped to Canadian Record of Employment (ROE) codes
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reasons</CardTitle>
          <CardDescription>
            {reasons.length} {reasons.length === 1 ? "reason" : "reasons"} · ROE codes{" "}
            {CANADIAN_ROE_CODES.map((row) => row.code).join(", ")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TerminationReasonList reasons={reasons} />
        </CardContent>
      </Card>
    </div>
  );
}
