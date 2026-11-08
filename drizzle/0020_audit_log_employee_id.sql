-- Migration: Change audit_logs.user_id to employee_id
-- Drop old foreign key constraint and column, add new employee_id column

ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_user_id_users_id_fk";
ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "audit_logs" ADD COLUMN "employee_id" integer;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE no action ON UPDATE no action;
