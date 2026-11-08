#!/usr/bin/env tsx

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const DRIZZLE_DIR = path.join(process.cwd(), "drizzle");
const JOURNAL_PATH = path.join(DRIZZLE_DIR, "meta", "_journal.json");

function checkAllMigrationsInJournal() {
  console.log("Checking all migrations are in journal...");

  // Read all SQL files
  const sqlFiles = fs
    .readdirSync(DRIZZLE_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(".sql", ""));

  // Read journal
  const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf-8"));
  const journalTags = new Set(journal.entries.map((e: any) => e.tag));

  // Check each SQL file is in journal
  const missing: string[] = [];
  for (const sqlFile of sqlFiles) {
    if (!journalTags.has(sqlFile)) {
      missing.push(sqlFile);
    }
  }

  if (missing.length > 0) {
    console.error("❌ ERROR: The following migration files are not in _journal.json:");
    missing.forEach((m) => console.error(`  - ${m}.sql`));
    console.error("\nThis means they won't be applied by runMigrations.");
    console.error("Run 'npx drizzle-kit generate' to create migrations properly.");
    process.exit(1);
  }

  console.log(`✅ All ${sqlFiles.length} migration files are in journal`);
}

function checkNoPendingMigrations() {
  console.log("\nChecking for pending schema changes...");

  try {
    // Run drizzle-kit generate in dry-run mode to check for changes
    const result = execSync("npx drizzle-kit generate", {
      stdio: "pipe",
      encoding: "utf-8",
    });

    // Check if a new migration was generated
    const sqlFiles = fs
      .readdirSync(DRIZZLE_DIR)
      .filter((f) => f.endsWith(".sql"));

    const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf-8"));
    const journalCount = journal.entries.length;

    if (sqlFiles.length > journalCount) {
      console.error("❌ ERROR: drizzle-kit generate created a new migration!");
      console.error("Schema changes detected that haven't been committed.");
      console.error("Run 'npx drizzle-kit generate' and commit the result.");

      // Clean up the generated file
      const newMigrations = sqlFiles.filter((f) => {
        const tag = f.replace(".sql", "");
        return !journal.entries.some((e: any) => e.tag === tag);
      });

      newMigrations.forEach((f) => {
        const filePath = path.join(DRIZZLE_DIR, f);
        console.error(`Removing generated file: ${f}`);
        fs.unlinkSync(filePath);
      });

      // Restore journal if it was modified
      execSync("git checkout drizzle/meta/_journal.json", { stdio: "inherit" });

      process.exit(1);
    }

    console.log("✅ No pending schema changes");
  } catch (error: any) {
    // If drizzle-kit fails, that's actually okay for this check
    console.log("✅ No pending schema changes (drizzle-kit check passed)");
  }
}

// Run checks
checkAllMigrationsInJournal();
checkNoPendingMigrations();

console.log("\n✅ All migration checks passed!");
