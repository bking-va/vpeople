import { db } from "@/lib/db";
import { jobOpenings, departments, locations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ApplicationForm } from "@/components/application-form";
import { toPublicCareerOpening } from "@/lib/careers-public";

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const openingId = parseInt(id, 10);
  if (!Number.isFinite(openingId)) {
    notFound();
  }

  const [row] = await db
    .select({
      id: jobOpenings.id,
      title: jobOpenings.title,
      employmentType: jobOpenings.employmentType,
      description: jobOpenings.description,
      requirements: jobOpenings.requirements,
      openDate: jobOpenings.openDate,
      departmentName: departments.name,
      locationName: locations.name,
    })
    .from(jobOpenings)
    .leftJoin(departments, eq(jobOpenings.departmentId, departments.id))
    .leftJoin(locations, eq(jobOpenings.locationId, locations.id))
    .where(and(eq(jobOpenings.id, openingId), eq(jobOpenings.status, "open")))
    .limit(1);

  if (!row) {
    notFound();
  }

  const opening = toPublicCareerOpening(row);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Apply for {opening.title}</h1>
          <p className="text-muted-foreground">
            {opening.departmentName} • {opening.locationName} • {opening.employmentType}
          </p>
        </div>

        <ApplicationForm openingId={opening.id} openingTitle={opening.title} />
      </div>
    </div>
  );
}
