-- Add saved reports and scheduled report emails
CREATE TABLE IF NOT EXISTS "saved_reports" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "report_type" VARCHAR(50) NOT NULL DEFAULT 'custom',
  "fields" TEXT NOT NULL,
  "filters" TEXT,
  "group_by" VARCHAR(100),
  "sort_by" VARCHAR(100),
  "sort_order" VARCHAR(10) DEFAULT 'asc',
  "is_shared" BOOLEAN DEFAULT false,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "scheduled_reports" (
  "id" SERIAL PRIMARY KEY,
  "saved_report_id" INTEGER NOT NULL REFERENCES "saved_reports"("id") ON DELETE CASCADE,
  "user_id" INTEGER NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "schedule_type" VARCHAR(20) NOT NULL DEFAULT 'weekly', -- daily, weekly, monthly
  "schedule_day" INTEGER, -- day of week (0-6) or day of month (1-31)
  "schedule_time" TIME DEFAULT '09:00:00',
  "recipient_emails" TEXT NOT NULL, -- JSON array of emails
  "format" VARCHAR(10) DEFAULT 'csv', -- csv, pdf
  "is_active" BOOLEAN DEFAULT true,
  "last_run_at" TIMESTAMP,
  "next_run_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_saved_reports_user_id" ON "saved_reports"("user_id");
CREATE INDEX IF NOT EXISTS "idx_saved_reports_is_shared" ON "saved_reports"("is_shared");
CREATE INDEX IF NOT EXISTS "idx_scheduled_reports_active" ON "scheduled_reports"("is_active");
CREATE INDEX IF NOT EXISTS "idx_scheduled_reports_next_run" ON "scheduled_reports"("next_run_at");
