import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { candidates } from "@/lib/db/schema";
import { hiringAccessForCandidate } from "@/lib/hiring-access";

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

  const access = await hiringAccessForCandidate(session.user.email, id);
  if (access.notFound) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [candidate] = await db
    .select({
      resumeBlobUrl: candidates.resumeBlobUrl,
    })
    .from(candidates)
    .where(eq(candidates.id, id))
    .limit(1);

  if (!candidate?.resumeBlobUrl) {
    return NextResponse.json({ error: "Resume not available" }, { status: 404 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Resume not available" }, { status: 404 });
  }

  const blobResponse = await fetch(candidate.resumeBlobUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!blobResponse.ok) {
    return NextResponse.json({ error: "Resume not available" }, { status: 404 });
  }

  const contentType =
    blobResponse.headers.get("content-type") || "application/octet-stream";
  return new NextResponse(blobResponse.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="resume-${id}"`,
      "Cache-Control": "private, max-age=0",
    },
  });
}
