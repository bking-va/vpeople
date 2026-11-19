import fs from "fs";

export type BambooSyncCliArgs = {
  dryRun: boolean;
  replaceDemo: boolean;
  incremental: boolean;
  atsApplications: boolean;
  skipResumes: boolean;
  dbUrlFile: string | null;
  cacheFile: string | null;
};

export function parseBambooSyncArgs(argv: string[]): BambooSyncCliArgs {
  const args: BambooSyncCliArgs = {
    dryRun: false,
    replaceDemo: false,
    incremental: false,
    atsApplications: false,
    skipResumes: false,
    dbUrlFile: null,
    cacheFile: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--replace-demo") args.replaceDemo = true;
    else if (arg === "--incremental") args.incremental = true;
    else if (arg === "--ats-applications") args.atsApplications = true;
    else if (arg === "--skip-resumes") args.skipResumes = true;
    else if (arg.startsWith("--cache=")) {
      args.cacheFile = arg.slice("--cache=".length);
    } else if (arg === "--cache") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        args.cacheFile = next;
        i += 1;
      }
    } else if (arg.startsWith("--db-url-file=")) {
      args.dbUrlFile = arg.slice("--db-url-file=".length);
    } else if (arg === "--db-url-file") {
      continue;
    } else if (!arg.startsWith("-")) {
      args.dbUrlFile = arg;
    }
  }
  const dbUrlFileIndex = argv.indexOf("--db-url-file");
  if (dbUrlFileIndex >= 0 && argv[dbUrlFileIndex + 1] && !argv[dbUrlFileIndex + 1].startsWith("-")) {
    args.dbUrlFile = argv[dbUrlFileIndex + 1];
  }
  return args;
}

export function readDatabaseUrl(opts: {
  dbUrlFile?: string | null;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = opts.env ?? process.env;
  const candidates = [
    opts.dbUrlFile,
    env.DATABASE_URL ? null : "/tmp/db_url.txt",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (candidate.startsWith("postgres://") || candidate.startsWith("postgresql://")) {
      return candidate.trim();
    }
    if (fs.existsSync(candidate)) {
      const value = fs.readFileSync(candidate, "utf-8").trim();
      if (value) return value;
    }
  }
  const fromEnv = env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;
  throw new Error(
    "DATABASE_URL not found. Pass a file path (e.g. /tmp/db_url.txt) or set DATABASE_URL."
  );
}
