import { db } from "@/lib/db";
import { jobOpenings, departments, locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Briefcase } from "lucide-react";
import Link from "next/link";

export default async function CareersPage() {
  const openings = await db
    .select({
      id: jobOpenings.id,
      title: jobOpenings.title,
      employmentType: jobOpenings.employmentType,
      description: jobOpenings.description,
      requirements: jobOpenings.requirements,
      openDate: jobOpenings.openDate,
      department: departments.name,
      location: locations.name,
    })
    .from(jobOpenings)
    .leftJoin(departments, eq(jobOpenings.departmentId, departments.id))
    .leftJoin(locations, eq(jobOpenings.locationId, locations.id))
    .where(eq(jobOpenings.status, "open"));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Join Our Team</h1>
          <p className="text-xl text-muted-foreground">
            Help us build the future of local marketing software
          </p>
          <p className="text-muted-foreground mt-2">
            {openings.length} open position{openings.length !== 1 ? "s" : ""}
          </p>
        </div>

        {openings.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Open Positions</h3>
              <p className="text-muted-foreground">
                We don&apos;t have any open positions at the moment. Check back soon!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {openings.map((opening) => (
              <Card key={opening.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-2xl mb-2">{opening.title}</CardTitle>
                      <CardDescription className="flex items-center gap-4 text-base">
                        {opening.department && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="h-4 w-4" />
                            {opening.department}
                          </span>
                        )}
                        {opening.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {opening.location}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    <Badge variant="default" className="ml-4">
                      {opening.employmentType}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {opening.description && (
                    <div className="mb-4">
                      <h4 className="font-semibold mb-2">About the Role</h4>
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {opening.description}
                      </p>
                    </div>
                  )}
                  {opening.requirements && (
                    <div className="mb-4">
                      <h4 className="font-semibold mb-2">Requirements</h4>
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {opening.requirements}
                      </p>
                    </div>
                  )}
                  <Button asChild size="lg">
                    <Link href={`/careers/${opening.id}/apply`}>
                      Apply for this Position
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
