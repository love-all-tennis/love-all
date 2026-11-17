ALTER TYPE "report_target_type" ADD VALUE IF NOT EXISTS 'direct_message';--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_low_id" text NOT NULL,
	"user_high_id" text NOT NULL,
	"started_by_id" text,
	"last_message_at" timestamp(3) with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_pair_unique" UNIQUE("user_low_id","user_high_id"),
	CONSTRAINT "conversation_pair_ordered" CHECK ("user_low_id" < "user_high_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_member" (
	"conversation_id" uuid,
	"user_id" text,
	"last_read_at" timestamp(3) with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_member_pkey" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "direct_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"conversation_id" uuid NOT NULL,
	"sender_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "direct_message_body_length" CHECK (char_length("body") between 1 and 2000)
);
--> statement-breakpoint
CREATE INDEX "conversation_user_high_idx" ON "conversation" ("user_high_id");--> statement-breakpoint
CREATE INDEX "conversation_started_by_created_idx" ON "conversation" ("started_by_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_member_user_idx" ON "conversation_member" ("user_id");--> statement-breakpoint
CREATE INDEX "direct_message_conversation_created_idx" ON "direct_message" ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "direct_message_sender_created_idx" ON "direct_message" ("sender_id","created_at");--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_user_low_id_user_id_fkey" FOREIGN KEY ("user_low_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_user_high_id_user_id_fkey" FOREIGN KEY ("user_high_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_started_by_id_user_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "conversation_member" ADD CONSTRAINT "conversation_member_conversation_id_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_member" ADD CONSTRAINT "conversation_member_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "direct_message" ADD CONSTRAINT "direct_message_conversation_id_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "direct_message" ADD CONSTRAINT "direct_message_sender_id_user_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "user"("id") ON DELETE CASCADE;