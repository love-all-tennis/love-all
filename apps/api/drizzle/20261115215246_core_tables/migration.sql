CREATE TYPE "handedness" AS ENUM('right', 'left');--> statement-breakpoint
CREATE TYPE "ntrp_level" AS ENUM('2.5', '3.0', '3.5', '4.0', '4.5', '5.0', '5.5');--> statement-breakpoint
CREATE TABLE "availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"profile_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_block_unique" UNIQUE("profile_id","weekday","start_time"),
	CONSTRAINT "availability_weekday_iso" CHECK ("weekday" between 1 and 7),
	CONSTRAINT "availability_ends_after_start" CHECK ("end_time" > "start_time")
);
--> statement-breakpoint
CREATE TABLE "metro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"center_point" geometry(point,4326) NOT NULL,
	"radius_km" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metro_radius_km_positive" CHECK ("radius_km" > 0)
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL UNIQUE,
	"display_name" text NOT NULL,
	"photo_url" text,
	"home_point" geometry(point,4326),
	"metro_id" uuid,
	"search_radius_km" integer DEFAULT 15 NOT NULL,
	"ntrp" "ntrp_level",
	"handedness" "handedness",
	"plays_singles" boolean DEFAULT false NOT NULL,
	"plays_doubles" boolean DEFAULT false NOT NULL,
	"plays_hitting" boolean DEFAULT false NOT NULL,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_home_point_rounded" CHECK ("home_point" is null or (
        ST_X("home_point") = round(ST_X("home_point")::numeric, 2)::float8
        and ST_Y("home_point") = round(ST_Y("home_point")::numeric, 2)::float8
      )),
	CONSTRAINT "profile_search_radius_km_range" CHECK ("search_radius_km" between 1 and 100),
	CONSTRAINT "profile_display_name_length" CHECK (char_length("display_name") between 1 and 50),
	CONSTRAINT "profile_bio_length" CHECK (char_length("bio") <= 500)
);
--> statement-breakpoint
CREATE INDEX "profile_home_point_idx" ON "profile" USING gist ("home_point");--> statement-breakpoint
CREATE INDEX "profile_metro_id_idx" ON "profile" ("metro_id");--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_profile_id_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_metro_id_metro_id_fkey" FOREIGN KEY ("metro_id") REFERENCES "metro"("id") ON DELETE SET NULL;