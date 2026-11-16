CREATE TYPE "report_reason" AS ENUM('spam', 'harassment', 'inappropriate', 'fake_profile', 'underage', 'other');--> statement-breakpoint
CREATE TYPE "report_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "report_target_type" AS ENUM('player');--> statement-breakpoint
CREATE TABLE "block" (
	"blocker_id" text,
	"blocked_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "block_pkey" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "block_not_self" CHECK ("blocker_id" <> "blocked_id")
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"reporter_id" text,
	"target_type" "report_target_type" NOT NULL,
	"target_id" text NOT NULL,
	"reason" "report_reason" NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'open'::"report_status" NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_details_length" CHECK (char_length("details") <= 1000)
);
--> statement-breakpoint
CREATE INDEX "block_blocked_id_idx" ON "block" ("blocked_id");--> statement-breakpoint
CREATE INDEX "report_target_idx" ON "report" ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "report_open_idx" ON "report" ("created_at") WHERE "status" = 'open';--> statement-breakpoint
ALTER TABLE "block" ADD CONSTRAINT "block_blocker_id_user_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "block" ADD CONSTRAINT "block_blocked_id_user_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_id_user_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "user"("id") ON DELETE SET NULL;