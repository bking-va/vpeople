CREATE TABLE IF NOT EXISTS "bamboo_sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"employees_fetched" integer DEFAULT 0 NOT NULL,
	"employees_created" integer DEFAULT 0 NOT NULL,
	"employees_updated" integer DEFAULT 0 NOT NULL,
	"demo_removed" integer DEFAULT 0 NOT NULL,
	"latest_changed" text,
	"unmapped_fields" jsonb,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "bamboo_id" text;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_bamboo_id_unique" UNIQUE("bamboo_id");