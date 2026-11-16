CREATE TABLE "follow" (
	"follower_id" text,
	"followed_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_pkey" PRIMARY KEY("follower_id","followed_id"),
	CONSTRAINT "follow_not_self" CHECK ("follower_id" <> "followed_id")
);
--> statement-breakpoint
CREATE INDEX "follow_followed_id_idx" ON "follow" ("followed_id");--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_follower_id_user_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_followed_id_user_id_fkey" FOREIGN KEY ("followed_id") REFERENCES "user"("id") ON DELETE CASCADE;