CREATE TYPE "report_resolution" AS ENUM('dismissed', 'content_hidden', 'player_suspended');--> statement-breakpoint
CREATE TABLE "account_suspension" (
	"user_id" text PRIMARY KEY,
	"suspended_by_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_suspension_reason_length" CHECK (char_length("reason") <= 500)
);
--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "resolution" "report_resolution";--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "resolved_by_id" text;--> statement-breakpoint
ALTER TABLE "account_suspension" ADD CONSTRAINT "account_suspension_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account_suspension" ADD CONSTRAINT "account_suspension_suspended_by_id_user_id_fkey" FOREIGN KEY ("suspended_by_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_resolved_by_id_user_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "user"("id") ON DELETE SET NULL;