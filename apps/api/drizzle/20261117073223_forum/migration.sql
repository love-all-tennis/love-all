CREATE TABLE "forum_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"metro_id" uuid CONSTRAINT "forum_category_metro_unique" UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"thread_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_post_body_length" CHECK (char_length("body") between 1 and 5000)
);
--> statement-breakpoint
CREATE TABLE "forum_thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"category_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"last_post_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_thread_title_length" CHECK (char_length("title") between 1 and 120),
	CONSTRAINT "forum_thread_body_length" CHECK (char_length("body") between 1 and 5000),
	CONSTRAINT "forum_thread_reply_count_positive" CHECK ("reply_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "forum_post_thread_created_idx" ON "forum_post" ("thread_id","created_at","id");--> statement-breakpoint
CREATE INDEX "forum_post_author_created_idx" ON "forum_post" ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "forum_thread_category_activity_idx" ON "forum_thread" ("category_id","last_post_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "deleted_at" is null and "hidden_at" is null;--> statement-breakpoint
CREATE INDEX "forum_thread_author_created_idx" ON "forum_thread" ("author_id","created_at");--> statement-breakpoint
ALTER TABLE "forum_category" ADD CONSTRAINT "forum_category_metro_id_metro_id_fkey" FOREIGN KEY ("metro_id") REFERENCES "metro"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "forum_post" ADD CONSTRAINT "forum_post_thread_id_forum_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "forum_thread"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "forum_post" ADD CONSTRAINT "forum_post_author_id_user_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "forum_thread" ADD CONSTRAINT "forum_thread_category_id_forum_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "forum_category"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "forum_thread" ADD CONSTRAINT "forum_thread_author_id_user_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE;