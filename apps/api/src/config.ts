import { Config } from "effect";

/** A comma-separated config value as a list, with blanks dropped. */
export const list = (name: string) =>
  Config.String(name).pipe(
    Config.map((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
