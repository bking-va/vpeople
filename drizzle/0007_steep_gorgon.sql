CREATE TABLE IF NOT EXISTS "enps_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"score" integer NOT NULL,
	"comment" text,
	"response_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "enps_responses_response_hash_unique" UNIQUE("response_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enps_surveys" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"question" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enps_responses" ADD CONSTRAINT "enps_responses_survey_id_enps_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."enps_surveys"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
