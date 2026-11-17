import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  geometry,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
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

/**
 * One row per player who blocked another. Blocking is one-way to record but
 * two-way in effect: neither player sees the other anywhere. Filter queries
 * that return other players with `notBlocked` from `./blocks`.
 */
export const block = pgTable(
  "block",
  {
    blockerId: text("blocker_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index("block_blocked_id_idx").on(t.blockedId),
    check("block_not_self", sql`${t.blockerId} <> ${t.blockedId}`),
  ],
);

/** What a report is about. Forum posts and direct messages join when those features land. */
export const reportTargetType = pgEnum("report_target_type", ["player"]);

export const reportReason = pgEnum("report_reason", [
  "spam",
  "harassment",
  "inappropriate",
  "fake_profile",
  "underage",
  "other",
]);

export const reportStatus = pgEnum("report_status", ["open", "resolved"]);

/**
 * A report for moderators. `target_id` is the reported thing's id (a user id
 * for a player), with no foreign key, so one table covers every target type.
 * The report outlives the reporter's account, so moderation history stays.
 */
export const report = pgTable(
  "report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: text("reporter_id").references(() => user.id, { onDelete: "set null" }),
    targetType: reportTargetType("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: reportReason("reason").notNull(),
    details: text("details"),
    status: reportStatus("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("report_target_idx").on(t.targetType, t.targetId),
    index("report_open_idx")
      .on(t.createdAt)
      .where(sql`${t.status} = 'open'`),
    check("report_details_length", sql`char_length(${t.details}) <= 1000`),
  ],
);

export const playSessionKind = pgEnum("play_session_kind", ["singles", "doubles", "hitting"]);

/** `invite_only`: only invited players can join. `open`: nearby players in range can find it too. */
export const playSessionVisibility = pgEnum("play_session_visibility", ["invite_only", "open"]);

/** `confirmed` once every spot is taken; back to `open` when someone leaves. */
export const playSessionStatus = pgEnum("play_session_status", ["open", "confirmed", "cancelled"]);

export const playSessionRole = pgEnum("play_session_role", ["host", "player"]);

/**
 * Where a player stands with a session. `invited` and `requested` wait on the
 * player and the host respectively; only `accepted` players take a spot.
 */
export const playSessionParticipantState = pgEnum("play_session_participant_state", [
  "invited",
  "requested",
  "accepted",
  "declined",
  "left",
]);

/**
 * A singles or doubles match, or a hitting session. The court is free text
 * with an optional map pin. A court is a public place, so the pin is stored
 * as given (unlike home points). With no pin, distance falls back to the
 * host's home point. A null level bound means "any".
 */
export const playSession = pgTable(
  "play_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: text("host_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: playSessionKind("kind").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: smallint("duration_minutes").notNull(),
    courtName: text("court_name").notNull(),
    courtPoint: point("court_point"),
    levelMin: ntrpLevel("level_min"),
    levelMax: ntrpLevel("level_max"),
    spots: smallint("spots").notNull(),
    visibility: playSessionVisibility("visibility").notNull(),
    status: playSessionStatus("status").notNull().default("open"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("play_session_host_id_idx").on(t.hostId),
    index("play_session_court_point_idx").using("gist", t.courtPoint),
    index("play_session_open_starts_at_idx")
      .on(t.startsAt)
      .where(sql`${t.visibility} = 'open' and ${t.status} = 'open'`),
    check(
      "play_session_spots_match_kind",
      sql`(${t.kind} = 'singles' and ${t.spots} = 2)
        or (${t.kind} = 'doubles' and ${t.spots} = 4)
        or (${t.kind} = 'hitting' and ${t.spots} between 2 and 4)`,
    ),
    check(
      "play_session_level_range",
      sql`${t.levelMin} is null or ${t.levelMax} is null or ${t.levelMin} <= ${t.levelMax}`,
    ),
    check("play_session_duration_range", sql`${t.durationMinutes} between 15 and 480`),
    check("play_session_court_name_length", sql`char_length(${t.courtName}) between 1 and 100`),
    check("play_session_notes_length", sql`char_length(${t.notes}) <= 500`),
  ],
);

/**
 * A player's place in a session. The host has a row too, as `host` /
 * `accepted`, so "accepted players" always includes them.
 */
export const playSessionParticipant = pgTable(
  "play_session_participant",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => playSession.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: playSessionRole("role").notNull().default("player"),
    state: playSessionParticipantState("state").notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.userId] }),
    index("play_session_participant_user_id_idx").on(t.userId),
    check(
      "play_session_participant_host_accepted",
      sql`${t.role} <> 'host' or ${t.state} = 'accepted'`,
    ),
  ],
);

/**
 * A logistics note on a session ("Court 4, I'll bring balls"). Only the host
 * and accepted players read and write them. Deleting sets `deleted_at`.
 */
export const playSessionComment = pgTable(
  "play_session_comment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => playSession.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("play_session_comment_session_created_idx").on(t.sessionId, t.createdAt, t.id),
    check("play_session_comment_body_length", sql`char_length(${t.body}) between 1 and 1000`),
  ],
);

export const playSessionResultStatus = pgEnum("play_session_result_status", [
  "pending",
  "confirmed",
  "disputed",
]);

export const playSessionResultSide = pgEnum("play_session_result_side", ["a", "b"]);

/**
 * The score of a singles or doubles session: one per session. A player
 * records it, and a player on the other side confirms or disputes it. A
 * disputed result can be recorded again, which replaces it. `sets` is
 * `[[a, b], ...]` in games (points for a match tiebreak), validated by the
 * domain `MatchScore`.
 */
export const playSessionResult = pgTable(
  "play_session_result",
  {
    sessionId: uuid("session_id")
      .primaryKey()
      .references(() => playSession.id, { onDelete: "cascade" }),
    sideA: text("side_a").array().notNull(),
    sideB: text("side_b").array().notNull(),
    sets: jsonb("sets").$type<Array<[number, number]>>().notNull(),
    winner: playSessionResultSide("winner").notNull(),
    status: playSessionResultStatus("status").notNull().default("pending"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    respondedBy: text("responded_by").references(() => user.id, { onDelete: "set null" }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check(
      "play_session_result_sides",
      sql`cardinality(${t.sideA}) between 1 and 2 and cardinality(${t.sideA}) = cardinality(${t.sideB})`,
    ),
    check(
      "play_session_result_sets",
      sql`jsonb_typeof(${t.sets}) = 'array' and jsonb_array_length(${t.sets}) between 1 and 3`,
    ),
    check(
      "play_session_result_response",
      sql`(${t.status} = 'pending') = (${t.respondedAt} is null)`,
    ),
  ],
);

/**
 * A forum category. Global categories have no metro; a metro's Local
 * category points at it, and only players in that metro see it. Seeded by
 * migration: General, Find a partner, Gear talk, Technique, and Detroit Local.
 */
export const forumCategory = pgTable(
  "forum_category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    sortOrder: smallint("sort_order").notNull().default(0),
    metroId: uuid("metro_id").references(() => metro.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [unique("forum_category_metro_unique").on(t.metroId)],
);

/**
 * A forum thread. Its opening text is `body`; replies are `forum_post`
 * rows. `last_post_at` and `reply_count` change with each reply, in the same
 * transaction, and lists are ordered by `last_post_at`. It is stored to the
 * millisecond so the list cursor can carry it exactly. `deleted_at` is the
 * author's soft delete and `hidden_at` a moderator's.
 */
export const forumThread = pgTable(
  "forum_thread",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => forumCategory.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    lastPostAt: timestamp("last_post_at", { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    replyCount: integer("reply_count").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("forum_thread_category_activity_idx")
      .on(t.categoryId, t.lastPostAt.desc(), t.id.desc())
      .where(sql`${t.deletedAt} is null and ${t.hiddenAt} is null`),
    index("forum_thread_author_created_idx").on(t.authorId, t.createdAt),
    check("forum_thread_title_length", sql`char_length(${t.title}) between 1 and 120`),
    check("forum_thread_body_length", sql`char_length(${t.body}) between 1 and 5000`),
    check("forum_thread_reply_count_positive", sql`${t.replyCount} >= 0`),
  ],
);

/** A reply in a forum thread. Deleting sets `deleted_at`; the reply shows as "Post deleted". */
export const forumPost = pgTable(
  "forum_post",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => forumThread.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("forum_post_thread_created_idx").on(t.threadId, t.createdAt, t.id),
    index("forum_post_author_created_idx").on(t.authorId, t.createdAt),
    check("forum_post_body_length", sql`char_length(${t.body}) between 1 and 5000`),
  ],
);

/** Reaction kinds; keep in step with `FORUM_REACTION_KINDS` in the domain. */
export const forumReactionKind = pgEnum("forum_reaction_kind", ["like", "helpful", "ace"]);

/**
 * A player's reaction to a thread or a reply: exactly one of `thread_id` and
 * `post_id` is set. A player reacts with each kind at most once per target.
 */
export const forumReaction = pgTable(
  "forum_reaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id").references(() => forumThread.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => forumPost.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: forumReactionKind("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("forum_reaction_thread_unique")
      .on(t.threadId, t.userId, t.kind)
      .where(sql`${t.threadId} is not null`),
    uniqueIndex("forum_reaction_post_unique")
      .on(t.postId, t.userId, t.kind)
      .where(sql`${t.postId} is not null`),
    check("forum_reaction_one_target", sql`num_nonnulls(${t.threadId}, ${t.postId}) = 1`),
  ],
);
