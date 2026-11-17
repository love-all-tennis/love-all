CREATE TYPE "club_access" AS ENUM('free', 'pay_to_play', 'members_only');--> statement-breakpoint
CREATE TABLE "club" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"address" text,
	"point" geometry(point,4326) NOT NULL,
	"access" "club_access" NOT NULL,
	"indoor_courts" boolean DEFAULT false NOT NULL,
	"metro_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_name_length" CHECK (char_length("name") between 1 and 100),
	CONSTRAINT "club_address_length" CHECK (char_length("address") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "club_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"club_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"rating" smallint NOT NULL,
	"body" text,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_review_author_unique" UNIQUE("club_id","author_id"),
	CONSTRAINT "club_review_rating_range" CHECK ("rating" between 1 and 5),
	CONSTRAINT "club_review_body_length" CHECK (char_length("body") between 1 and 2000)
);
--> statement-breakpoint
CREATE INDEX "club_point_idx" ON "club" USING gist ("point");--> statement-breakpoint
CREATE INDEX "club_created_by_idx" ON "club" ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "club_review_club_created_idx" ON "club_review" ("club_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "club_review_author_idx" ON "club_review" ("author_id");--> statement-breakpoint
ALTER TABLE "club" ADD CONSTRAINT "club_metro_id_metro_id_fkey" FOREIGN KEY ("metro_id") REFERENCES "metro"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "club" ADD CONSTRAINT "club_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "club_review" ADD CONSTRAINT "club_review_club_id_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "club_review" ADD CONSTRAINT "club_review_author_id_user_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE;