import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { customFields, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default async function CustomFieldsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  // Check if user is full admin
  const employeeId = session.user.employeeId;
  if (!employeeId) {
    redirect("/settings");
  }

  const [currentEmployee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!currentEmployee || currentEmployee.accessLevel !== "full_admin") {
    redirect("/settings");
  }

  const fields = await db
    .select()
    .from(customFields)
    .orderBy(customFields.entityType, customFields.orderIndex);

  // Group by entity type
  const fieldsByEntity = fields.reduce((acc, field) => {
    if (!acc[field.entityType]) {
      acc[field.entityType] = [];
    }
    acc[field.entityType].push(field);
    return acc;
  }, {} as Record<string, typeof fields>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Custom Fields</h1>
          <p className="text-muted-foreground">
            Define custom fields for employee profiles and other entities
          </p>
        </div>
        <Button asChild>
          <Link href="/settings/custom-fields/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Custom Field
          </Link>
        </Button>
      </div>

      {Object.keys(fieldsByEntity).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(fieldsByEntity).map(([entityType, entityFields]) => (
            <Card key={entityType}>
              <CardHeader>
                <CardTitle className="capitalize">{entityType} Fields</CardTitle>
                <CardDescription>
                  {entityFields.length} custom field{entityFields.length !== 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {entityFields.map((field) => (
                    <div
                      key={field.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{field.name}</span>
                          {field.isRequired && (
                            <Badge variant="secondary" className="text-xs">
                              Required
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="capitalize">{field.fieldType}</span>
                          {field.section && (
                            <>
                              <span>•</span>
                              <span>Section: {field.section}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/settings/custom-fields/${field.id}`}>Edit</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No custom fields defined yet</p>
            <Button asChild>
              <Link href="/settings/custom-fields/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Custom Field
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
