CREATE TABLE IF NOT EXISTS "company_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"bamboo_id" text NOT NULL,
	"title" text NOT NULL,
	"bamboo_category" text,
	"category" "document_category" NOT NULL,
	"restricted" boolean DEFAULT false NOT NULL,
	"contains_compensation" boolean DEFAULT false NOT NULL,
	"file_url" text,
	"size_bytes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_files_bamboo_id_unique" UNIQUE("bamboo_id")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "bamboo_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "bamboo_category" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "restricted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_bamboo_id_unique" UNIQUE("bamboo_id");