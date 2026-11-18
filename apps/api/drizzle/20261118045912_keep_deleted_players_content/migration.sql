ALTER TABLE "play_session" ALTER COLUMN "host_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "play_session_result" ALTER COLUMN "recorded_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "forum_post" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "forum_thread" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "play_session" DROP CONSTRAINT "play_session_host_id_user_id_fkey", ADD CONSTRAINT "play_session_host_id_user_id_fkey" FOREIGN KEY ("host_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "play_session_result" DROP CONSTRAINT "play_session_result_recorded_by_user_id_fkey", ADD CONSTRAINT "play_session_result_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "forum_post" DROP CONSTRAINT "forum_post_author_id_user_id_fkey", ADD CONSTRAINT "forum_post_author_id_user_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "forum_thread" DROP CONSTRAINT "forum_thread_author_id_user_id_fkey", ADD CONSTRAINT "forum_thread_author_id_user_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE SET NULL;