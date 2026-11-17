CREATE TYPE "equipment_kind" AS ENUM('racket', 'strings', 'shoes', 'balls', 'bag', 'other');--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" "equipment_kind" NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"name_key" text GENERATED ALWAYS AS (lower(regexp_replace(brand || ' ' || model, '\s+', ' ', 'g'))) STORED NOT NULL,
	"created_by" text,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_brand_length" CHECK (char_length("brand") between 1 and 40),
	CONSTRAINT "equipment_model_length" CHECK (char_length("model") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "equipment_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"equipment_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"rating" smallint NOT NULL,
	"title" text,
	"body" text,
	"author_ntrp" "ntrp_level",
	"hidden_at" timestamp with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_review_author_unique" UNIQUE("equipment_id","author_id"),
	CONSTRAINT "equipment_review_rating_range" CHECK ("rating" between 1 and 5),
	CONSTRAINT "equipment_review_title_length" CHECK ("title" is null or char_length("title") between 1 and 80),
	CONSTRAINT "equipment_review_body_length" CHECK ("body" is null or char_length("body") between 1 and 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_kind_name_unique" ON "equipment" ("kind","name_key");--> statement-breakpoint
CREATE INDEX "equipment_name_idx" ON "equipment" ("name_key","id");--> statement-breakpoint
CREATE INDEX "equipment_created_by_idx" ON "equipment" ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "equipment_review_recent_idx" ON "equipment_review" ("equipment_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "equipment_review" ADD CONSTRAINT "equipment_review_equipment_id_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "equipment_review" ADD CONSTRAINT "equipment_review_author_id_user_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE;