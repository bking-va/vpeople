-- Concurrent first hits could leave duplicate (identifier, endpoint) rows
-- under the old non-unique index. Collapse those before uniqueness.
DELETE FROM "rate_limits" AS a
USING "rate_limits" AS b
WHERE a."identifier" = b."identifier"
  AND a."endpoint" = b."endpoint"
  AND a."id" < b."id";--> statement-breakpoint
DROP INDEX IF EXISTS "rate_limits_identifier_endpoint_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rate_limits_identifier_endpoint_uidx" ON "rate_limits" USING btree ("identifier","endpoint");--> statement-breakpoint
-- Collapse old ISO-week biweekly keys (YYYY-WNN) that map to the same fortnight.
DELETE FROM "time_off_accrual_runs" AS a
USING "time_off_accrual_runs" AS b
WHERE a."balance_id" = b."balance_id"
  AND a."period_key" ~ '^[0-9]{4}-W[0-9]{2}$'
  AND b."period_key" ~ '^[0-9]{4}-W[0-9]{2}$'
  AND substring(a."period_key" from 1 for 4) = substring(b."period_key" from 1 for 4)
  AND ceil(substring(a."period_key" from 7 for 2)::numeric / 2)
    = ceil(substring(b."period_key" from 7 for 2)::numeric / 2)
  AND a."id" < b."id";--> statement-breakpoint
UPDATE "time_off_accrual_runs"
SET "period_key" = substring("period_key" from 1 for 4)
  || '-F'
  || lpad((ceil(substring("period_key" from 7 for 2)::numeric / 2))::int::text, 2, '0')
WHERE "period_key" ~ '^[0-9]{4}-W[0-9]{2}$'
  AND NOT EXISTS (
    SELECT 1
    FROM "time_off_accrual_runs" AS other
    WHERE other."balance_id" = "time_off_accrual_runs"."balance_id"
      AND other."id" <> "time_off_accrual_runs"."id"
      AND other."period_key" = substring("time_off_accrual_runs"."period_key" from 1 for 4)
        || '-F'
        || lpad((ceil(substring("time_off_accrual_runs"."period_key" from 7 for 2)::numeric / 2))::int::text, 2, '0')
  );--> statement-breakpoint
DELETE FROM "time_off_accrual_runs"
WHERE "period_key" ~ '^[0-9]{4}-W[0-9]{2}$';
