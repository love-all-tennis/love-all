ALTER TYPE "report_target_type" ADD VALUE 'forum_thread';--> statement-breakpoint
ALTER TYPE "report_target_type" ADD VALUE 'forum_post';--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "content" text;--> statement-breakpoint
CREATE INDEX "report_subject_idx" ON "report" ("subject_id");--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_subject_id_user_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
-- Reports filed before this migration were all about players: the player is the subject.
UPDATE "report" SET "subject_id" = "target_id" WHERE "target_type" = 'player' AND EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "report"."target_id");
