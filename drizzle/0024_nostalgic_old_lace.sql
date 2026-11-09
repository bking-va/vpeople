CREATE TABLE IF NOT EXISTS "employment_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"effective_date" date NOT NULL,
	"status" "employment_status" NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employment_status_history" ADD CONSTRAINT "employment_status_history_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "employment_status_history" ("employee_id", "effective_date", "status", "comment")
SELECT "id", COALESCE("hire_date", CURRENT_DATE), "employment_status", 'Hire'
FROM "employees"
WHERE NOT EXISTS (
  SELECT 1 FROM "employment_status_history" h WHERE h."employee_id" = "employees"."id"
);
