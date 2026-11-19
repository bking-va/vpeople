import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companyFiles, employees } from "@/lib/db/schema";
import { getUserPermissions } from "@/lib/permissions";
import { canViewCompanyFile } from "@/lib/document-access";
import type { AccessLevel } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [employee] = await db
    .select({ id: employees.id, accessLevel: employees.accessLevel })
    .from(employees)
    .where(eq(employees.email, session.user.email))
    .limit(1);
  if (!employee) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [file] = await db
    .select()
    .from(companyFiles)
    .where(eq(companyFiles.id, id))
    .limit(1);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const permissions = await getUserPermissions(session.user.email);
  const allowed = canViewCompanyFile({
    accessLevel: employee.accessLevel as AccessLevel,
    canManageUsers: permissions.canManageUsers,
    file: {
      restricted: file.restricted,
      containsCompensation: file.containsCompensation,
    },
  });
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!file.fileUrl || !process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "File not available" }, { status: 404 });
  }

  const blobResponse = await fetch(file.fileUrl, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });
  if (!blobResponse.ok) {
    return NextResponse.json({ error: "File not available" }, { status: 404 });
  }
  return new NextResponse(blobResponse.body, {
    headers: {
      "Content-Type":
        blobResponse.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": `attachment; filename="company-file-${id}"`,
      "Cache-Control": "private, max-age=0",
    },
  });
}
