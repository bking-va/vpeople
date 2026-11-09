ALTER TYPE "public"."approval_workflow_type" ADD VALUE IF NOT EXISTS 'promotion';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"published_by_id" integer,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "letter_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"requires_signature" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "letter_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "termination_reasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"roe_code" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "termination_reasons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "original_hire_date" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "termination_reason_id" integer;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "termination_type" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "roe_code" text;--> statement-breakpoint
ALTER TABLE "employment_status_history" ADD COLUMN IF NOT EXISTS "change_type" text DEFAULT 'status_change' NOT NULL;--> statement-breakpoint
ALTER TABLE "employment_status_history" ADD COLUMN IF NOT EXISTS "termination_reason_id" integer;--> statement-breakpoint
ALTER TABLE "employment_status_history" ADD COLUMN IF NOT EXISTS "recorded_by_id" integer;--> statement-breakpoint
UPDATE "employees" SET "original_hire_date" = "hire_date" WHERE "original_hire_date" IS NULL AND "hire_date" IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcements" ADD CONSTRAINT "announcements_published_by_id_employees_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employees" ADD CONSTRAINT "employees_termination_reason_id_termination_reasons_id_fk" FOREIGN KEY ("termination_reason_id") REFERENCES "public"."termination_reasons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employment_status_history" ADD CONSTRAINT "employment_status_history_termination_reason_id_termination_reasons_id_fk" FOREIGN KEY ("termination_reason_id") REFERENCES "public"."termination_reasons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employment_status_history" ADD CONSTRAINT "employment_status_history_recorded_by_id_employees_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
