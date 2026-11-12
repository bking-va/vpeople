import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees, letterTemplates } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LETTER_MERGE_FIELDS } from "@/lib/letter-merge";
import { getSessionUserPermissions } from "@/lib/permissions";
import { canManageAccessScopes } from "@/lib/access-scopes";
import { LetterIssueForm } from "@/components/letter-issue-form";

export default async function LetterTemplatesPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/");
  if (!session.user.employeeId) redirect("/settings");

  const [currentEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, session.user.employeeId))
    .limit(1);
  if (!currentEmployee) redirect("/settings");
  const permissions = await getSessionUserPermissions(session);
  if (
    !canManageAccessScopes({
      employeeId: currentEmployee.id,
      accessLevel: currentEmployee.accessLevel,
      canManageUsers: permissions.canManageUsers,
    })
  ) {
    redirect("/settings");
  }

  const templates = await db.select().from(letterTemplates);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Letter templates</h1>
        <p className="text-muted-foreground">
          Merge fields: {LETTER_MERGE_FIELDS.map((field) => `{{${field}}}`).join(", ")}
        </p>
      </div>
      <div className="space-y-4">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <CardTitle>{template.name}</CardTitle>
              <CardDescription>
                {template.category}
                {template.requiresSignature ? " · requires signature" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{template.body}</pre>
              <LetterIssueForm templateId={template.id} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
