CREATE TYPE "forum_reaction_kind" AS ENUM('like', 'helpful', 'ace');--> statement-breakpoint
CREATE TABLE "forum_reaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"thread_id" uuid,
	"post_id" uuid,
	"user_id" text NOT NULL,
	"kind" "forum_reaction_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_reaction_one_target" CHECK (num_nonnulls("thread_id", "post_id") = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "forum_reaction_thread_unique" ON "forum_reaction" ("thread_id","user_id","kind") WHERE "thread_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "forum_reaction_post_unique" ON "forum_reaction" ("post_id","user_id","kind") WHERE "post_id" is not null;--> statement-breakpoint
ALTER TABLE "forum_reaction" ADD CONSTRAINT "forum_reaction_thread_id_forum_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "forum_thread"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "forum_reaction" ADD CONSTRAINT "forum_reaction_post_id_forum_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "forum_post"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "forum_reaction" ADD CONSTRAINT "forum_reaction_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;