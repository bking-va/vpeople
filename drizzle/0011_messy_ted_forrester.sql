CREATE TYPE "public"."training_status" AS ENUM('pending', 'completed', 'overdue');--> statement-breakpoint
ALTER TABLE "training_completions" ALTER COLUMN "completed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "training_completions" ADD COLUMN "status" "training_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "training_completions" ADD COLUMN "due_date" timestamp;--> statement-breakpoint
ALTER TABLE "training_completions" ADD COLUMN "score" integer;