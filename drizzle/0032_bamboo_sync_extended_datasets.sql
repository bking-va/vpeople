ALTER TABLE "bamboo_sync_runs" ADD COLUMN "dataset_counts" jsonb;--> statement-breakpoint
ALTER TABLE "employee_education" ADD COLUMN "bamboo_id" text;--> statement-breakpoint
ALTER TABLE "employee_visas" ADD COLUMN "bamboo_id" text;--> statement-breakpoint
ALTER TABLE "job_openings" ADD COLUMN "bamboo_id" text;--> statement-breakpoint
ALTER TABLE "job_openings" ADD COLUMN "bamboo_status_id" text;--> statement-breakpoint
ALTER TABLE "job_openings" ADD COLUMN "bamboo_status_label" text;--> statement-breakpoint
ALTER TABLE "time_off_policies" ADD COLUMN "bamboo_id" text;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD COLUMN "bamboo_id" text;--> statement-breakpoint
ALTER TABLE "employee_education" ADD CONSTRAINT "employee_education_bamboo_id_unique" UNIQUE("bamboo_id");--> statement-breakpoint
ALTER TABLE "employee_visas" ADD CONSTRAINT "employee_visas_bamboo_id_unique" UNIQUE("bamboo_id");--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_bamboo_id_unique" UNIQUE("bamboo_id");--> statement-breakpoint
ALTER TABLE "time_off_policies" ADD CONSTRAINT "time_off_policies_bamboo_id_unique" UNIQUE("bamboo_id");--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_bamboo_id_unique" UNIQUE("bamboo_id");