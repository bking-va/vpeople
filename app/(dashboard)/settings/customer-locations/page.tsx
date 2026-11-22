import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { customerLocations } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { canEditCustomerLocations } from "@/lib/matching/access";
import { CustomerLocationsAdmin } from "@/components/customer-locations-admin";

export default async function CustomerLocationsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/");
  if (!(await canEditCustomerLocations(session.user.email))) redirect("/settings");

  const locations = await db
    .select()
    .from(customerLocations)
    .orderBy(desc(customerLocations.updatedAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Customer locations</h1>
        <p className="text-muted-foreground">
          Points and regions used when a job requires proximity to customers. Store city, province,
          country, or postal code only — never a street address. This list is a placeholder until a
          Vendasta CRM / Lightdash feed can upsert the same rows by external id.
        </p>
      </div>
      <CustomerLocationsAdmin locations={locations} />
    </div>
  );
}
