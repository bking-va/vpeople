import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { accessLevels } from "@/lib/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Plus } from "lucide-react";
import Link from "next/link";

export default async function AccessLevelsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "full_admin") {
    redirect("/");
  }

  const levels = await db.select().from(accessLevels).orderBy(accessLevels.id);

  const permissions = [
    { key: "canViewCompensation", label: "View Compensation" },
    { key: "canEditCompensation", label: "Edit Compensation" },
    { key: "canViewSensitivePersonalInfo", label: "View SIN/SSN" },
    { key: "canEditSensitivePersonalInfo", label: "Edit SIN/SSN" },
    { key: "canViewBankInfo", label: "View Bank Info" },
    { key: "canEditBankInfo", label: "Edit Bank Info" },
    { key: "canManageUsers", label: "Manage Users" },
    { key: "canManageSettings", label: "Manage Settings" },
    { key: "canApproveTimeOff", label: "Approve Time Off" },
    { key: "canApproveCompensationChanges", label: "Approve Comp Changes" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Access Levels</h1>
          <p className="text-muted-foreground">
            Manage roles and permissions
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/settings">Back to Settings</Link>
        </Button>
      </div>

      <div className="space-y-4">
        {levels.map((level) => (
          <Card key={level.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle>{level.name}</CardTitle>
                  <CardDescription>{level.description}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{level.code}</Badge>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/settings/access-levels/${level.code}`}>Edit</Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {permissions.map((perm) => {
                  const hasPermission =
                    level[perm.key as keyof typeof level] === true;
                  return (
                    <div key={perm.key} className="flex items-center gap-2">
                      {hasPermission ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <X className="h-4 w-4 text-gray-300" />
                      )}
                      <span
                        className={
                          hasPermission ? "text-sm" : "text-sm text-muted-foreground"
                        }
                      >
                        {perm.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permission Enforcement</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            These permissions are enforced throughout the application:
          </p>
          <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1">
            <li>Compensation data is hidden unless canViewCompensation is true</li>
            <li>SIN/SSN fields are restricted unless canViewSensitivePersonalInfo is true</li>
            <li>Bank information is protected unless canViewBankInfo is true</li>
            <li>Time-off approvals require canApproveTimeOff permission</li>
            <li>Settings pages require canManageSettings permission</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
