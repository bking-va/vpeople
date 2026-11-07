import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const SEED_TOKEN = process.env.SEED_TOKEN;

export async function POST(request: NextRequest) {
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

    const command = reset ? "npm run db:seed -- --reset" : "npm run db:seed";

    const { stdout, stderr } = await execAsync(command, {
      env: { ...process.env },
      cwd: process.cwd(),
    });

    console.log("Seed output:", stdout);
    if (stderr) console.error("Seed stderr:", stderr);

    return NextResponse.json({
      success: true,
      message: "Database seeded successfully",
      output: stdout,
    });
  } catch (error: any) {
    console.error("Seed failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Seed failed",
        message: error.message,
        output: error.stdout || "",
        stderr: error.stderr || "",
      },
      { status: 500 }
    );
  }
}
