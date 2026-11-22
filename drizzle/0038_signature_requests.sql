CREATE TYPE "public"."signature_request_status" AS ENUM('draft', 'sent', 'viewed', 'signed', 'declined', 'voided');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signature_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"requested_by" integer NOT NULL,
	"vsign_envelope_id" text,
	"status" "signature_request_status" DEFAULT 'draft' NOT NULL,
	"sender_email" text NOT NULL,
	"signer_email" text NOT NULL,
	"signer_name" text NOT NULL,
	"signed_pdf_url" text,
	"certificate_url" text,
	"previewed_at" timestamp,
	"sent_at" timestamp,
	"viewed_at" timestamp,
	"completed_at" timestamp,
	"last_event_type" text,
	"last_event_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "signature_requests_vsign_envelope_id_unique" UNIQUE("vsign_envelope_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_requested_by_employees_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signature_requests_document_idx" ON "signature_requests" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signature_requests_employee_idx" ON "signature_requests" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signature_requests_status_idx" ON "signature_requests" USING btree ("status");