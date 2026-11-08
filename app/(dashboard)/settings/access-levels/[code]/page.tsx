import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { accessLevels } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AccessLevelForm } from "@/components/access-level-form";

export default async function EditAccessLevelPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "full_admin") {
    redirect("/settings");
  }

  const { code } = await params;

  const [level] = await db
    .select()
    .from(accessLevels)
    .where(eq(accessLevels.code, code));

  if (!level) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Edit Access Level</h1>
        <p className="text-muted-foreground">
          Configure field-level permissions for {level.name}
        </p>
      </div>

      <AccessLevelForm level={level} />
    </div>
  );
}
