import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { ntrpLevel } from "./app-schema";
import { user } from "./auth-schema";

/** Same values, in order, as `EQUIPMENT_KINDS` in the domain package. */
export const equipmentKind = pgEnum("equipment_kind", [
  "racket",
  "strings",
  "shoes",
  "balls",
  "bag",
  "other",
]);

/**
 * An item in the shared gear catalog. Any player can add one. `name_key` is
 * brand and model lowercased with runs of spaces collapsed: the catalog is
 * sorted and searched by it, and it keeps the same item from being added
 * twice under one kind. `hidden_at` is for moderators.
 */
export const equipment = pgTable(
  "equipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: equipmentKind("kind").notNull(),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    nameKey: text("name_key")
      .notNull()
      .generatedAlwaysAs(sql`lower(regexp_replace(brand || ' ' || model, '\\s+', ' ', 'g'))`),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("equipment_kind_name_unique").on(t.kind, t.nameKey),
    index("equipment_name_idx").on(t.nameKey, t.id),
    index("equipment_created_by_idx").on(t.createdBy, t.createdAt),
    check("equipment_brand_length", sql`char_length(${t.brand}) between 1 and 40`),
    check("equipment_model_length", sql`char_length(${t.model}) between 1 and 80`),
  ],
);

/**
 * A player's review of an item: one per player per item, replaced when they
 * save it again. `author_ntrp` is the author's level when they last saved it.
 * `created_at` is stored to the millisecond so the list cursor carries it
 * exactly. `hidden_at` is for moderators.
 */
export const equipmentReview = pgTable(
  "equipment_review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    title: text("title"),
    body: text("body"),
    authorNtrp: ntrpLevel("author_ntrp"),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    unique("equipment_review_author_unique").on(t.equipmentId, t.authorId),
    index("equipment_review_recent_idx").on(t.equipmentId, t.createdAt.desc(), t.id.desc()),
    check("equipment_review_rating_range", sql`${t.rating} between 1 and 5`),
    check(
      "equipment_review_title_length",
      sql`${t.title} is null or char_length(${t.title}) between 1 and 80`,
    ),
    check(
      "equipment_review_body_length",
      sql`${t.body} is null or char_length(${t.body}) between 1 and 2000`,
    ),
  ],
);
