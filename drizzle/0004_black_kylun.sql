CREATE TABLE IF NOT EXISTS "holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"date" date NOT NULL,
	"country" text NOT NULL,
	"location_id" integer,
	"is_recurring" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "time_off_balance_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"balance_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"reason" text NOT NULL,
	"adjusted_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "holidays" ADD CONSTRAINT "holidays_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_off_balance_adjustments" ADD CONSTRAINT "time_off_balance_adjustments_balance_id_time_off_balances_id_fk" FOREIGN KEY ("balance_id") REFERENCES "public"."time_off_balances"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_off_balance_adjustments" ADD CONSTRAINT "time_off_balance_adjustments_adjusted_by_employees_id_fk" FOREIGN KEY ("adjusted_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
