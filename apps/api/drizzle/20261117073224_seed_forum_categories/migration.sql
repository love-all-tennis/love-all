-- The global forum categories, plus a Local category for each launch metro
-- (Detroit for now). Local categories sort first in the app.
INSERT INTO "forum_category" ("slug", "name", "sort_order")
VALUES
  ('general', 'General', 1),
  ('find-a-partner', 'Find a partner', 2),
  ('gear-talk', 'Gear talk', 3),
  ('technique', 'Technique', 4)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "forum_category" ("slug", "name", "sort_order", "metro_id")
SELECT 'detroit-local', 'Detroit Local', 0, "id" FROM "metro" WHERE "slug" = 'detroit'
ON CONFLICT ("slug") DO NOTHING;
