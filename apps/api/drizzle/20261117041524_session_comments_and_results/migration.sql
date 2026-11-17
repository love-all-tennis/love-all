CREATE TYPE "play_session_result_side" AS ENUM('a', 'b');--> statement-breakpoint
CREATE TYPE "play_session_result_status" AS ENUM('pending', 'confirmed', 'disputed');--> statement-breakpoint
CREATE TABLE "play_session_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"session_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "play_session_comment_body_length" CHECK (char_length("body") between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "play_session_result" (
	"session_id" uuid PRIMARY KEY,
	"side_a" text[] NOT NULL,
	"side_b" text[] NOT NULL,
	"sets" jsonb NOT NULL,
	"winner" "play_session_result_side" NOT NULL,
	"status" "play_session_result_status" DEFAULT 'pending'::"play_session_result_status" NOT NULL,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_by" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "play_session_result_sides" CHECK (cardinality("side_a") between 1 and 2 and cardinality("side_a") = cardinality("side_b")),
	CONSTRAINT "play_session_result_sets" CHECK (jsonb_typeof("sets") = 'array' and jsonb_array_length("sets") between 1 and 3),
	CONSTRAINT "play_session_result_response" CHECK (("status" = 'pending') = ("responded_at" is null))
);
--> statement-breakpoint
CREATE INDEX "play_session_comment_session_created_idx" ON "play_session_comment" ("session_id","created_at","id");--> statement-breakpoint
ALTER TABLE "play_session_comment" ADD CONSTRAINT "play_session_comment_session_id_play_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "play_session"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "play_session_comment" ADD CONSTRAINT "play_session_comment_author_id_user_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "play_session_result" ADD CONSTRAINT "play_session_result_session_id_play_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "play_session"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "play_session_result" ADD CONSTRAINT "play_session_result_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "play_session_result" ADD CONSTRAINT "play_session_result_responded_by_user_id_fkey" FOREIGN KEY ("responded_by") REFERENCES "user"("id") ON DELETE SET NULL;