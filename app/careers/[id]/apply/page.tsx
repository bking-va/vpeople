import { db } from "@/lib/db";
import { jobOpenings, departments, locations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ApplicationForm } from "@/components/application-form";

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const openingId = parseInt(id);

  const [opening] = await db
    .select({
      id: jobOpenings.id,
      title: jobOpenings.title,
      employmentType: jobOpenings.employmentType,
      department: departments.name,
      location: locations.name,
    })
    .from(jobOpenings)
    .leftJoin(departments, eq(jobOpenings.departmentId, departments.id))
    .leftJoin(locations, eq(jobOpenings.locationId, locations.id))
    .where(and(eq(jobOpenings.id, openingId), eq(jobOpenings.status, "open")));

  if (!opening || opening.id === null) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Apply for {opening.title}</h1>
          <p className="text-muted-foreground">
            {opening.department} • {opening.location} • {opening.employmentType}
          </p>
        </div>

        <ApplicationForm openingId={opening.id} openingTitle={opening.title} />
      </div>
    </div>
  );
}
