CREATE TYPE "public"."location_requirement" AS ENUM('none', 'near_office', 'near_customers', 'near_office_or_customers');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_match_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer,
	"job_opening_id" integer,
	"role_query" text NOT NULL,
	"filters" jsonb,
	"result_keys" jsonb,
	"model" text,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"shortlist_size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"city" text,
	"province" text,
	"country" text NOT NULL,
	"postal_code" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resume_summaries" (
	"content_hash" text PRIMARY KEY NOT NULL,
	"extracted_text" text,
	"summary_json" jsonb,
	"summary_model" text,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "address_city" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "address_province" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "address_postal_code" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "address_country" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "resume_content_hash" text;--> statement-breakpoint
ALTER TABLE "job_openings" ADD COLUMN "location_requirement" "location_requirement" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_openings" ADD COLUMN "location_max_distance_km" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "job_openings" ADD COLUMN "location_weight" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_match_runs" ADD CONSTRAINT "candidate_match_runs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_match_runs" ADD CONSTRAINT "candidate_match_runs_job_opening_id_job_openings_id_fk" FOREIGN KEY ("job_opening_id") REFERENCES "public"."job_openings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidate_match_runs_employee_idx" ON "candidate_match_runs" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "candidate_match_runs_opening_idx" ON "candidate_match_runs" USING btree ("job_opening_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_locations_external_id_uidx" ON "customer_locations" USING btree ("external_id");