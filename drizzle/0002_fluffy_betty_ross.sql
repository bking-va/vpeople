CREATE TYPE "public"."approval_workflow_type" AS ENUM('time_off', 'compensation_change', 'employment_status_change', 'job_info_change', 'information_update');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "access_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"can_view_compensation" boolean DEFAULT false NOT NULL,
	"can_edit_compensation" boolean DEFAULT false NOT NULL,
	"can_view_sensitive_personal_info" boolean DEFAULT false NOT NULL,
	"can_edit_sensitive_personal_info" boolean DEFAULT false NOT NULL,
	"can_view_bank_info" boolean DEFAULT false NOT NULL,
	"can_edit_bank_info" boolean DEFAULT false NOT NULL,
	"can_manage_users" boolean DEFAULT false NOT NULL,
	"can_manage_settings" boolean DEFAULT false NOT NULL,
	"can_approve_time_off" boolean DEFAULT false NOT NULL,
	"can_approve_compensation_changes" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "access_levels_name_unique" UNIQUE("name"),
	CONSTRAINT "access_levels_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_workflow_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflow_id" integer NOT NULL,
	"step_order" integer NOT NULL,
	"approver_role" text NOT NULL,
	"required_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_workflows" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "approval_workflow_type" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"requires_manager_approval" boolean DEFAULT true NOT NULL,
	"requires_admin_approval" boolean DEFAULT false NOT NULL,
	"auto_approve_after_days" integer,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_workflow_steps" ADD CONSTRAINT "approval_workflow_steps_workflow_id_approval_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."approval_workflows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
