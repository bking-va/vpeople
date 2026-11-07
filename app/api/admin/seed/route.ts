import { NextRequest, NextResponse } from "next/server";
import { runSeed } from "@/lib/seed";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const SEED_TOKEN = process.env.SEED_TOKEN;

  if (!SEED_TOKEN) {
    return NextResponse.json(
      { error: "Seed endpoint is disabled (SEED_TOKEN not configured)" },
      { status: 404 }
    );
  }

  const authHeader = request.headers.get("x-seed-token");

  if (authHeader !== SEED_TOKEN) {
    return NextResponse.json(
      { error: "Unauthorized - invalid or missing X-Seed-Token header" },
      { status: 401 }
    );
  }

  try {
    const { reset = false } = await request.json().catch(() => ({}));

    console.log("Starting database seed...", { reset });

    const result = await runSeed({ reset });

    console.log("Seed completed:", result);

    return NextResponse.json({
      ...result,
      message: "Database seeded successfully",
    });
  } catch (error: any) {
    console.error("Seed failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Seed failed",
        message: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
