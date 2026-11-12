ALTER TYPE "public"."document_category" ADD VALUE IF NOT EXISTS 'letter';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_access_scopes" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"location_id" integer,
	"country" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "body" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "letter_template_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_access_scopes" ADD CONSTRAINT "employee_access_scopes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_access_scopes" ADD CONSTRAINT "employee_access_scopes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_letter_template_id_letter_templates_id_fk" FOREIGN KEY ("letter_template_id") REFERENCES "public"."letter_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "employee_access_scopes_unique" ON "employee_access_scopes" ("employee_id","location_id","country") NULLS NOT DISTINCT;
DO $$ BEGIN
 ALTER TABLE "employee_access_scopes" ADD CONSTRAINT "employee_access_scopes_location_or_country" CHECK ("location_id" IS NOT NULL OR "country" IS NOT NULL);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
