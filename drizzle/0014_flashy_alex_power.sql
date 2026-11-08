CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'number', 'date', 'select', 'textarea', 'checkbox');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_field_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"custom_field_id" integer NOT NULL,
	"entity_id" integer NOT NULL,
	"value" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"field_type" "custom_field_type" NOT NULL,
	"entity_type" text NOT NULL,
	"section" text,
	"options" text,
	"is_required" boolean DEFAULT false NOT NULL,
	"order_index" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_custom_field_id_custom_fields_id_fk" FOREIGN KEY ("custom_field_id") REFERENCES "public"."custom_fields"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
