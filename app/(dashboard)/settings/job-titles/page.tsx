import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { jobTitles, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { JobTitleList } from "@/components/job-title-list";

export default async function JobTitlesPage() {
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

  const titles = await db.select().from(jobTitles).orderBy(jobTitles.title);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Job Titles</h1>
          <p className="text-muted-foreground">
            Maintain the list of job titles used across the organization
          </p>
        </div>
        <Link href="/settings/job-titles/new">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Title
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Titles</CardTitle>
          <CardDescription>
            {titles.length} {titles.length === 1 ? "title" : "titles"} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          <JobTitleList titles={titles} />
        </CardContent>
      </Card>
    </div>
  );
}
