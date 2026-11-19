CREATE TABLE IF NOT EXISTS "employee_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"bamboo_id" text,
	"employee_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"serial_number" text,
	"assigned_date" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employee_assets_bamboo_id_unique" UNIQUE("bamboo_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_dependents" (
	"id" serial PRIMARY KEY NOT NULL,
	"bamboo_id" text,
	"employee_id" integer NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"relationship" text,
	"birth_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employee_dependents_bamboo_id_unique" UNIQUE("bamboo_id")
);
--> statement-breakpoint
ALTER TABLE "custom_fields" ADD COLUMN "bamboo_id" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "ethnicity" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "eeo_job_category" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "pay_group" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "flsa_exempt" boolean;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "standard_hours_per_week" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "time_tracking_enabled" boolean;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_assets" ADD CONSTRAINT "employee_assets_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_dependents" ADD CONSTRAINT "employee_dependents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "custom_field_values_field_entity_unique" ON "custom_field_values" USING btree ("custom_field_id","entity_id");--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_bamboo_id_unique" UNIQUE("bamboo_id");