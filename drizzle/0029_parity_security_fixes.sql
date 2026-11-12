ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "contains_compensation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "documents" AS d
SET "contains_compensation" = true
FROM "letter_templates" AS t
WHERE d."letter_template_id" = t."id"
  AND t."body" ~* '\{\{\s*payRate\s*\}\}';--> statement-breakpoint
UPDATE "employment_status_history"
SET "change_type" = 'terminate'
WHERE "status" = 'terminated'
  AND "change_type" IS DISTINCT FROM 'terminate';
