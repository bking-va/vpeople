CREATE TABLE IF NOT EXISTS "employee_compensation_table_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"bamboo_id" text,
	"employee_id" integer NOT NULL,
	"table_alias" text NOT NULL,
	"row_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employee_compensation_table_rows_bamboo_id_unique" UNIQUE("bamboo_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_compensation_table_rows" ADD CONSTRAINT "employee_compensation_table_rows_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_comp_table_rows_employee_alias_idx" ON "employee_compensation_table_rows" USING btree ("employee_id","table_alias");