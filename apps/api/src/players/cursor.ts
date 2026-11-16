import { Option, Schema } from "effect";

/**
 * Where a page of nearby players ended: the last player's exact distance in
 * metres and their id. Results are ordered by (distance, id), so the next page
 * starts strictly after this pair. Many players share a distance because home
 * points are rounded, which is why the id is part of the key.
 */
export interface PlayersCursor {
  readonly distanceM: number;
  readonly id: string;
}

const CursorJson = Schema.fromJsonString(Schema.Tuple([Schema.Finite, Schema.String]));
const decodeJson = Schema.decodeUnknownOption(CursorJson);

/** An opaque, URL-safe token. Clients pass it back unchanged. */
export const encodeCursor = (cursor: PlayersCursor): string =>
  Buffer.from(JSON.stringify([cursor.distanceM, cursor.id])).toString("base64url");

/** None when the token wasn't made by `encodeCursor`. */
export const decodeCursor = (token: string): Option.Option<PlayersCursor> => {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return Option.none();
  return decodeJson(Buffer.from(token, "base64url").toString("utf8")).pipe(
    Option.filter(([distanceM, id]) => distanceM >= 0 && id.length > 0),
    Option.map(([distanceM, id]) => ({ distanceM, id })),
  );
};

/**
 * Distance as shown to players: whole kilometres, never 0. Home points are
 * rounded to about 1 km, so finer detail would be noise (and a privacy leak).
 */
export const displayKm = (metres: number): number => Math.max(1, Math.round(metres / 1000));
