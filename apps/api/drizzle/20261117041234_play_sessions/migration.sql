CREATE TYPE "play_session_kind" AS ENUM('singles', 'doubles', 'hitting');--> statement-breakpoint
CREATE TYPE "play_session_participant_state" AS ENUM('invited', 'requested', 'accepted', 'declined', 'left');--> statement-breakpoint
CREATE TYPE "play_session_role" AS ENUM('host', 'player');--> statement-breakpoint
CREATE TYPE "play_session_status" AS ENUM('open', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "play_session_visibility" AS ENUM('invite_only', 'open');--> statement-breakpoint
CREATE TABLE "play_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"host_id" text NOT NULL,
	"kind" "play_session_kind" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" smallint NOT NULL,
	"court_name" text NOT NULL,
	"court_point" geometry(point,4326),
	"level_min" "ntrp_level",
	"level_max" "ntrp_level",
	"spots" smallint NOT NULL,
	"visibility" "play_session_visibility" NOT NULL,
	"status" "play_session_status" DEFAULT 'open'::"play_session_status" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "play_session_spots_match_kind" CHECK (("kind" = 'singles' and "spots" = 2)
        or ("kind" = 'doubles' and "spots" = 4)
        or ("kind" = 'hitting' and "spots" between 2 and 4)),
	CONSTRAINT "play_session_level_range" CHECK ("level_min" is null or "level_max" is null or "level_min" <= "level_max"),
	CONSTRAINT "play_session_duration_range" CHECK ("duration_minutes" between 15 and 480),
	CONSTRAINT "play_session_court_name_length" CHECK (char_length("court_name") between 1 and 100),
	CONSTRAINT "play_session_notes_length" CHECK (char_length("notes") <= 500)
);
--> statement-breakpoint
CREATE TABLE "play_session_participant" (
	"session_id" uuid,
	"user_id" text,
	"role" "play_session_role" DEFAULT 'player'::"play_session_role" NOT NULL,
	"state" "play_session_participant_state" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "play_session_participant_pkey" PRIMARY KEY("session_id","user_id"),
	CONSTRAINT "play_session_participant_host_accepted" CHECK ("role" <> 'host' or "state" = 'accepted')
);
--> statement-breakpoint
CREATE INDEX "play_session_host_id_idx" ON "play_session" ("host_id");--> statement-breakpoint
CREATE INDEX "play_session_court_point_idx" ON "play_session" USING gist ("court_point");--> statement-breakpoint
CREATE INDEX "play_session_open_starts_at_idx" ON "play_session" ("starts_at") WHERE "visibility" = 'open' and "status" = 'open';--> statement-breakpoint
CREATE INDEX "play_session_participant_user_id_idx" ON "play_session_participant" ("user_id");--> statement-breakpoint
ALTER TABLE "play_session" ADD CONSTRAINT "play_session_host_id_user_id_fkey" FOREIGN KEY ("host_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "play_session_participant" ADD CONSTRAINT "play_session_participant_session_id_play_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "play_session"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "play_session_participant" ADD CONSTRAINT "play_session_participant_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;