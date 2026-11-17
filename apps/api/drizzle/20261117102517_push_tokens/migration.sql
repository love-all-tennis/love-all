CREATE TYPE "device_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "push_token" (
	"token" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"platform" "device_platform" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "push_token_user_id_idx" ON "push_token" ("user_id");--> statement-breakpoint
ALTER TABLE "push_token" ADD CONSTRAINT "push_token_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;