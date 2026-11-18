ALTER TABLE "employees" ADD COLUMN "pending_supervisor_bamboo_id" text;--> statement-breakpoint
ALTER TABLE "time_off_balances" ADD COLUMN "source_balance" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
UPDATE "time_off_balances" SET "source_balance" = "balance";