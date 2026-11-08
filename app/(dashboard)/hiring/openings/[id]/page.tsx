import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { jobOpenings, candidates, employees, departments, locations } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, MapPin, Users, Calendar, Edit } from "lucide-react";
import Link from "next/link";

export default async function JobOpeningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const { id } = await params;
  const openingId = parseInt(id);
  const isAdmin = session.user.role === "full_admin" || session.user.role === "admin";

  const [opening] = await db
    .select({
      id: jobOpenings.id,
      title: jobOpenings.title,
      status: jobOpenings.status,
      employmentType: jobOpenings.employmentType,
      description: jobOpenings.description,
      requirements: jobOpenings.requirements,
      openDate: jobOpenings.openDate,
      closeDate: jobOpenings.closeDate,
      departmentId: jobOpenings.departmentId,
      departmentName: departments.name,
      locationId: jobOpenings.locationId,
      locationName: locations.name,
      hiringLeadId: jobOpenings.hiringLeadId,
      hiringLeadName: employees.firstName,
      hiringLeadLastName: employees.lastName,
      createdAt: jobOpenings.createdAt,
    })
    .from(jobOpenings)
    .leftJoin(departments, eq(jobOpenings.departmentId, departments.id))
    .leftJoin(locations, eq(jobOpenings.locationId, locations.id))
    .leftJoin(employees, eq(jobOpenings.hiringLeadId, employees.id))
    .where(eq(jobOpenings.id, openingId));

  if (!opening) {
    notFound();
  }

  // Count candidates by stage
  const candidateStats = await db
    .select({
      stage: candidates.stage,
      count: sql<number>`count(*)::int`,
    })
    .from(candidates)
    .where(eq(candidates.jobOpeningId, openingId))
    .groupBy(candidates.stage);

  const statsMap = new Map(candidateStats.map((s) => [s.stage, s.count]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{opening.title}</h1>
          <div className="flex items-center gap-4 mt-2">
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
            <span className="text-muted-foreground capitalize">
              {opening.employmentType?.replace("_", " ")}
            </span>
          </div>
        </div>
        {isAdmin && (
          <Button asChild variant="outline">
            <Link href={`/hiring/openings/${opening.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Candidates</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Array.from(statsMap.values()).reduce((sum, count) => sum + count, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Department</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">
              {opening.departmentName || "Not specified"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Location</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">
              {opening.locationName || "Remote"}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Job Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">
              {opening.description || "No description provided"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">
              {opening.requirements || "No requirements listed"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Candidate Pipeline</CardTitle>
            <Button asChild size="sm">
              <Link href={`/hiring/openings/${opening.id}/candidates`}>
                View All Candidates
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <div className="text-sm font-medium">New</div>
              <div className="text-2xl font-bold">{statsMap.get("new") || 0}</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Phone Screen</div>
              <div className="text-2xl font-bold">{statsMap.get("phone_screen") || 0}</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Interview</div>
              <div className="text-2xl font-bold">{statsMap.get("interview") || 0}</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Offer</div>
              <div className="text-2xl font-bold">{statsMap.get("offer") || 0}</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Hired</div>
              <div className="text-2xl font-bold">{statsMap.get("hired") || 0}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
          {opening.closeDate && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Close Date</span>
              <span>{opening.closeDate}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created</span>
            <span>{new Date(opening.createdAt).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
