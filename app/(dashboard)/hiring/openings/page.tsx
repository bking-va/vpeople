import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { jobOpenings, employees, departments, locations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, Plus } from "lucide-react";
import Link from "next/link";

export default async function JobOpeningsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const isAdmin = session.user.role === "full_admin" || session.user.role === "admin";

  const openings = await db
    .select({
      id: jobOpenings.id,
      title: jobOpenings.title,
      status: jobOpenings.status,
      employmentType: jobOpenings.employmentType,
      openDate: jobOpenings.openDate,
      closeDate: jobOpenings.closeDate,
      departmentName: departments.name,
      locationName: locations.name,
      hiringLeadName: employees.firstName,
      hiringLeadLastName: employees.lastName,
    })
    .from(jobOpenings)
    .leftJoin(departments, eq(jobOpenings.departmentId, departments.id))
    .leftJoin(locations, eq(jobOpenings.locationId, locations.id))
    .leftJoin(employees, eq(jobOpenings.hiringLeadId, employees.id))
    .orderBy(desc(jobOpenings.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Job Openings</h1>
          <p className="text-muted-foreground">{openings.length} openings</p>
        </div>
        {isAdmin && (
          <Button asChild>
            <Link href="/hiring/openings/new">
              <Plus className="h-4 w-4 mr-2" />
              New Opening
            </Link>
          </Button>
        )}
      </div>

      {openings.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Job Openings</h3>
              <p className="text-muted-foreground mb-4">
                Create your first job opening to start receiving applications
              </p>
              {isAdmin && (
                <Button asChild>
                  <Link href="/hiring/openings/new">Create Opening</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {openings.map((opening) => (
            <Link key={opening.id} href={`/hiring/openings/${opening.id}`}>
              <Card className="h-full hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{opening.title}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {opening.departmentName || "No Department"}
                      </p>
                    </div>
                    <Badge
                      variant={
                        opening.status === "open"
                          ? "default"
                          : opening.status === "draft"
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {opening.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span>{opening.locationName || "Remote"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="capitalize">
                      {opening.employmentType?.replace("_", " ")}
                    </span>
                  </div>
                  {opening.hiringLeadName && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Hiring Lead</span>
                      <span>
                        {opening.hiringLeadName} {opening.hiringLeadLastName}
                      </span>
                    </div>
                  )}
                  {opening.openDate && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Open Date</span>
                      <span>{opening.openDate}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
