ALTER TABLE "conversation" DROP CONSTRAINT "conversation_pair_ordered";--> statement-breakpoint
UPDATE "conversation" SET "user_low_id" = "user_high_id", "user_high_id" = "user_low_id" WHERE "user_low_id" collate "C" > "user_high_id";--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_pair_ordered" CHECK ("user_low_id" collate "C" < "user_high_id");
