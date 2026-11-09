ALTER TABLE "employees" ADD COLUMN "vendasta_sub" text;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_vendasta_sub_unique" UNIQUE("vendasta_sub");