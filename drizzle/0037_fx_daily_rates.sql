CREATE TABLE IF NOT EXISTS "fx_daily_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"currency" text NOT NULL,
	"cad_per_unit" numeric(18, 8) NOT NULL,
	"rate_date" date NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fx_daily_rates_currency_rate_date_uidx" ON "fx_daily_rates" USING btree ("currency","rate_date");