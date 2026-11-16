import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  geometry,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { HOME_POINT_DECIMALS } from "./geo";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

/** A WGS 84 point. Drizzle reads and writes it as `{ x: lng, y: lat }`. */
const point = (name: string) => geometry(name, { type: "point", mode: "xy", srid: 4326 });

/** NTRP levels, in order, so `ntrp between '3.0' and '4.0'` works on the enum. "5.5" means 5.5+. */
export const ntrpLevel = pgEnum("ntrp_level", ["2.5", "3.0", "3.5", "4.0", "4.5", "5.0", "5.5"]);

export const handedness = pgEnum("handedness", ["right", "left"]);

/** A launch area. Profiles and Local forum threads point at one. Detroit is seeded. */
export const metro = pgTable(
  "metro",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    centerPoint: point("center_point").notNull(),
    radiusKm: integer("radius_km").notNull(),
    ...timestamps,
  },
  (t) => [check("metro_radius_km_positive", sql`${t.radiusKm} > 0`)],
);

/**
 * One per user: what other players see. Onboarding fills it in over a few
 * screens, so everything past the display name starts out empty.
 */
export const profile = pgTable(
  "profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    photoUrl: text("photo_url"),
    /** Rounded to `HOME_POINT_DECIMALS`; never an exact address. Use `roundHomePoint` before writing. */
    homePoint: point("home_point"),
    metroId: uuid("metro_id").references(() => metro.id, { onDelete: "set null" }),
    searchRadiusKm: integer("search_radius_km").notNull().default(15),
    ntrp: ntrpLevel("ntrp"),
    handedness: handedness("handedness"),
    playsSingles: boolean("plays_singles").notNull().default(false),
    playsDoubles: boolean("plays_doubles").notNull().default(false),
    playsHitting: boolean("plays_hitting").notNull().default(false),
    bio: text("bio"),
    ...timestamps,
  },
  (t) => [
    index("profile_home_point_idx").using("gist", t.homePoint),
    index("profile_metro_id_idx").on(t.metroId),
    check(
      "profile_home_point_rounded",
      sql`${t.homePoint} is null or (
        ST_X(${t.homePoint}) = round(ST_X(${t.homePoint})::numeric, ${sql.raw(String(HOME_POINT_DECIMALS))})::float8
        and ST_Y(${t.homePoint}) = round(ST_Y(${t.homePoint})::numeric, ${sql.raw(String(HOME_POINT_DECIMALS))})::float8
      )`,
    ),
    check("profile_search_radius_km_range", sql`${t.searchRadiusKm} between 1 and 100`),
    check("profile_display_name_length", sql`char_length(${t.displayName}) between 1 and 50`),
    check("profile_bio_length", sql`char_length(${t.bio}) <= 500`),
  ],
);

/**
 * A weekly time block, such as Tuesday 18:00 to 21:00. Weekday follows ISO
 * 8601 (1 = Monday, 7 = Sunday), the same as Postgres `isodow`.
 */
export const availability = pgTable(
  "availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("availability_block_unique").on(t.profileId, t.weekday, t.startTime),
    check("availability_weekday_iso", sql`${t.weekday} between 1 and 7`),
    check("availability_ends_after_start", sql`${t.endTime} > ${t.startTime}`),
  ],
);

/**
 * A player I follow for later. Private to the follower: the followed player
 * is never told. Both sides are account ids, so deleting either account
 * removes the row.
 */
export const follow = pgTable(
  "follow",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    followedId: text("followed_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followedId] }),
    index("follow_followed_id_idx").on(t.followedId),
    check("follow_not_self", sql`${t.followerId} <> ${t.followedId}`),
  ],
);
