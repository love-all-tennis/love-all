import type { Availability } from "@love-all/domain";
import { asc, eq } from "drizzle-orm";
import { Effect } from "effect";
import type { Db } from "../Db";
import { availability } from "./schema";

/** A profile's weekly availability, sorted by weekday then start time. */
export const loadAvailability = (db: Db["Service"], profileId: string) =>
  db
    .select({
      weekday: availability.weekday,
      startTime: availability.startTime,
      endTime: availability.endTime,
    })
    .from(availability)
    .where(eq(availability.profileId, profileId))
    .orderBy(asc(availability.weekday), asc(availability.startTime))
    .pipe(
      Effect.map((rows): Availability =>
        rows.map((row) => ({
          weekday: row.weekday,
          // Postgres `time` reads back as "HH:MM:SS"; the API speaks "HH:MM".
          startTime: row.startTime.slice(0, 5),
          endTime: row.endTime.slice(0, 5),
        })),
      ),
    );
