CREATE TABLE IF NOT EXISTS "candidate_application_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"bamboo_question_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_application_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"bamboo_id" text NOT NULL,
	"author_name" text,
	"author_bamboo_id" text,
	"content" text NOT NULL,
	"commented_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_application_comments_bamboo_id_unique" UNIQUE("bamboo_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"bamboo_event_id" text NOT NULL,
	"bamboo_status_id" text,
	"status_label" text NOT NULL,
	"changed_at" timestamp,
	"changed_by_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_status_history_bamboo_event_id_unique" UNIQUE("bamboo_event_id")
);
--> statement-breakpoint
ALTER TABLE "bamboo_sync_runs" ADD COLUMN "kind" text DEFAULT 'employees' NOT NULL;--> statement-breakpoint
ALTER TABLE "bamboo_sync_runs" ADD COLUMN "checkpoint" jsonb;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "bamboo_id" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "resume_bamboo_file_id" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "resume_blob_url" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "source_detail" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "bamboo_status_id" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "bamboo_status_label" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "cover_letter" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "ats_detail_imported_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_application_answers" ADD CONSTRAINT "candidate_application_answers_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_application_comments" ADD CONSTRAINT "candidate_application_comments_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_status_history" ADD CONSTRAINT "candidate_status_history_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "candidate_application_answers_candidate_question_unique" ON "candidate_application_answers" USING btree ("candidate_id","bamboo_question_id");--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_bamboo_id_unique" UNIQUE("bamboo_id");