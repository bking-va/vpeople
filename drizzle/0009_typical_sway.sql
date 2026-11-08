CREATE TABLE IF NOT EXISTS "enps_survey_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"has_responded" boolean DEFAULT false NOT NULL,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"endpoint" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enps_responses" DROP CONSTRAINT "enps_responses_response_hash_unique";--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "api_key_hash" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enps_survey_participants" ADD CONSTRAINT "enps_survey_participants_survey_id_enps_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."enps_surveys"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enps_survey_participants" ADD CONSTRAINT "enps_survey_participants_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enps_survey_participants_survey_employee_idx" ON "enps_survey_participants" USING btree ("survey_id","employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_identifier_endpoint_idx" ON "rate_limits" USING btree ("identifier","endpoint");--> statement-breakpoint
ALTER TABLE "enps_responses" DROP COLUMN IF EXISTS "response_hash";--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_api_key_hash_unique" UNIQUE("api_key_hash");